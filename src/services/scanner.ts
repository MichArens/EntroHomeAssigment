import { Octokit } from '@octokit/rest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Finding } from '../types';
import { detectSecrets } from '../utils/secrets';
import { formatDuration } from '../utils/time';
import { 
  saveCheckpoint, 
  getCheckpoint, 
  saveFinding, 
  setStatus, 
  setProgress, 
  setStartTime, 
  setEndTime, 
  setResultsFile, 
  getFindings, 
  getStartTime, 
  getEndTime, 
  deleteScan 
} from './redis';

export class GitHubScanner {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private scanId: string;

  constructor(githubToken: string, repository: string, scanId: string) {
    this.octokit = new Octokit({ auth: githubToken });
    const parts = repository.split('/');
    this.owner = parts[0];
    this.repo = parts[1];
    this.scanId = scanId;
  }

  async scan(): Promise<void> {
    try {
      await setStatus(this.scanId, 'in-progress');
      
      const checkpoint = await getCheckpoint(this.scanId);
      const existingStartTime = await getStartTime(this.scanId);
      
      if (!existingStartTime) {
        await setStartTime(this.scanId, new Date().toISOString());
        console.log(`[${this.scanId}] Starting new scan`);
      } else {
        console.log(`[${this.scanId}] Resuming scan from checkpoint`);
      }
      
      const startFrom = checkpoint ? checkpoint.lastCommitSha : null;
      const totalProcessedSoFar = checkpoint ? checkpoint.totalCommits : 0;
      
      const totalCommits = await this.scanCommits(startFrom, totalProcessedSoFar);
      
      const endTime = new Date().toISOString();
      await setEndTime(this.scanId, endTime);
      
      await this.saveResultsToFile(totalCommits);
      
      await setStatus(this.scanId, 'completed');
      await setProgress(this.scanId, { current: totalCommits, total: totalCommits });
      
      await deleteScan(this.scanId);
    } catch (error) {
      await setStatus(this.scanId, 'failed');
      throw error;
    }
  }

  private async saveResultsToFile(totalCommits: number): Promise<void> {
    try {
      const resultsDirectory = join(process.cwd(), 'results');
      
      try {
        await fs.access(resultsDirectory);
      } catch {
        await fs.mkdir(resultsDirectory, { recursive: true });
      }
      
      const filename = `scan_${this.scanId}_results.json`;
      const filePath = join(resultsDirectory, filename);
      
      const findings = await getFindings(this.scanId);
      const startTime = await getStartTime(this.scanId);
      const endTime = await getEndTime(this.scanId);
      
      const resultsData = {
        scanId: this.scanId,
        repository: `${this.owner}/${this.repo}`,
        totalFindings: findings.length,
        totalCommits: totalCommits,
        scanDate: new Date().toISOString(),
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        duration: startTime && endTime ? formatDuration(startTime, endTime) : undefined,
        findings: findings
      };
      
      await fs.writeFile(filePath, JSON.stringify(resultsData, null, 2), 'utf-8');
      await setResultsFile(this.scanId, filePath);
    } catch (error) {
      // Do not throw, continue without file
    }
  }

  private async scanCommits(startFrom: string | null, totalProcessedSoFar: number): Promise<number> {
    let totalProcessed = totalProcessedSoFar;
    
    console.log(`[${this.scanId}] Fetching commit history...`);
    
    const allCommits = await this.fetchAllCommits();
    allCommits.reverse();
    
    console.log(`[${this.scanId}] Found ${allCommits.length} total commits`);
    
    const startIndex = this.findStartIndex(allCommits, startFrom);
    
    for (let i = startIndex; i < allCommits.length; i++) {
      const commitSha = allCommits[i];
      
      await this.processCommit(commitSha);
      totalProcessed++;

      await saveCheckpoint(this.scanId, {
        lastCommitSha: commitSha,
        timestamp: new Date().toISOString(),
        totalCommits: totalProcessed
      });

      await setProgress(this.scanId, { current: i + 1, total: allCommits.length });
    }
    
    console.log(`[${this.scanId}] Finished processing all commits`);
    return allCommits.length;
  }

  private async fetchAllCommits(): Promise<string[]> {
    const allCommits: string[] = [];
    let page = 1;
    
    while (true) {
      try {
        const response = await this.octokit.repos.listCommits({
          owner: this.owner,
          repo: this.repo,
          per_page: 100,
          page: page
        });

        await this.handleRateLimit(response);

        if (response.data.length === 0) {
          break;
        }

        for (const commit of response.data) {
          allCommits.push(commit.sha);
        }

        if (response.data.length < 100) {
          break;
        }

        page++;
      } catch (error) {
        if (this.isRateLimitError(error)) {
          await this.waitForRateLimit();
          continue;
        }
        throw error;
      }
    }
    
    return allCommits;
  }

  private findStartIndex(allCommits: string[], startFrom: string | null): number {
    if (!startFrom) {
      console.log(`[${this.scanId}] Starting from oldest commit`);
      return 0;
    }
    
    const checkpointIndex = allCommits.indexOf(startFrom);
    if (checkpointIndex !== -1) {
      console.log(`[${this.scanId}] Resuming from commit ${checkpointIndex + 2}/${allCommits.length}`);
      return checkpointIndex + 1;
    }
    
    console.log(`[${this.scanId}] Checkpoint commit not found, starting from beginning`);
    return 0;
  }

  private async processCommit(commitSha: string): Promise<void> {
    try {
      console.log(`[${this.scanId}] Processing commit: ${commitSha}`);
      
      const commitDetails = await this.octokit.repos.getCommit({
        owner: this.owner,
        repo: this.repo,
        ref: commitSha
      });

      await this.handleRateLimit(commitDetails);

      const commit = commitDetails.data;
      const committerInfo = this.getCommitterInfo(commit);
      const timestamp = commit.commit.committer?.date || commit.commit.author?.date || new Date().toISOString();

      if (commit.files) {
        for (const file of commit.files) {
          if (file.patch) {
            await this.scanDiff(file.patch, commitSha, committerInfo, timestamp, file.filename);
          }
        }
      }
    } catch (error) {
      if (this.isRateLimitError(error)) {
        await this.waitForRateLimit();
        await this.processCommit(commitSha);
      }
    }
  }

  private getCommitterInfo(commit: any): string {
    const committer = commit.commit.committer?.name || commit.commit.author?.name || 'Unknown';
    const committerEmail = commit.commit.committer?.email || commit.commit.author?.email || '';
    return committerEmail ? `${committer} <${committerEmail}>` : committer;
  }

  private async scanDiff(
    patch: string,
    commitSha: string,
    committer: string,
    timestamp: string,
    filename: string
  ): Promise<void> {
    const lines = patch.split('\n');
    let currentLineNumber = 0;
    
    for (const line of lines) {
      const hunkLineNumber = this.parseDiffHunkHeader(line);
      if (hunkLineNumber !== null) {
        currentLineNumber = hunkLineNumber;
        continue;
      }
      
      if (this.isAddedLine(line)) {
        const content = line.substring(1);
        await this.scanLineForSecrets(content, commitSha, committer, timestamp, filename, currentLineNumber);
        currentLineNumber++;
      } else if (!this.isRemovedLine(line)) {
        currentLineNumber++;
      }
    }
  }

  private parseDiffHunkHeader(line: string): number | null {
    if (!line.startsWith('@@')) {
      return null;
    }
    
    const match = line.match(/@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    return match ? parseInt(match[1], 10) : null;
  }

  private isAddedLine(line: string): boolean {
    return line.startsWith('+') && !line.startsWith('+++');
  }

  private isRemovedLine(line: string): boolean {
    return line.startsWith('-');
  }

  private async scanLineForSecrets(
    content: string,
    commitSha: string,
    committer: string,
    timestamp: string,
    filename: string,
    lineNumber: number
  ): Promise<void> {
    const secrets = detectSecrets(content);
    
    for (const secret of secrets) {
      console.log(`[${this.scanId}] 🔍 Found ${secret.type} in ${filename}:${lineNumber} (commit: ${commitSha.substring(0, 7)})`);
      
      const finding: Finding = {
        commit: commitSha,
        commitUrl: `https://github.com/${this.owner}/${this.repo}/commit/${commitSha}`,
        committer: committer,
        timestamp: timestamp,
        file: filename,
        line: lineNumber,
        leakValue: secret.value,
        leakType: secret.type
      };
      
      await saveFinding(this.scanId, finding);
    }
  }

  private async handleRateLimit(response: any): Promise<void> {
    const remaining = response.headers['x-ratelimit-remaining'];
    const reset = response.headers['x-ratelimit-reset'];
    
    if (remaining && parseInt(remaining) < 10) {
      const resetTime = parseInt(reset) * 1000;
      const now = Date.now();
      const waitMillis = resetTime - now + 1000;
      
      if (waitMillis > 0) {
        await this.sleep(waitMillis);
      }
    }
  }

  private isRateLimitError(error: any): boolean {
    return error.status === 403 || error.status === 429;
  }

  private async waitForRateLimit(): Promise<void> {
    await this.sleep(60000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

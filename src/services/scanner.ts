import { Octokit } from '@octokit/rest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Finding } from '../types';
import { detectSecrets } from '../utils/secrets';
import { saveCheckpoint, getCheckpoint, saveFinding, setStatus, setProgress, setStartTime, setEndTime, setResultsFile, getFindings, getStartTime, getEndTime, deleteScan } from './redis';

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
      
      // Check if this is a resumed scan or a new scan
      const checkpoint = await getCheckpoint(this.scanId);
      const existingStartTime = await getStartTime(this.scanId);
      
      // Only set start time if this is a new scan (no existing start time)
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
      
      // Clean up Redis data after successful completion
      await deleteScan(this.scanId);
    } catch (error) {
      await setStatus(this.scanId, 'failed');
      // Keep the last known progress for failed scans
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
        duration: startTime && endTime ? this.formatDuration(startTime, endTime) : undefined,
        findings: findings
      };
      
      await fs.writeFile(filePath, JSON.stringify(resultsData, null, 2), 'utf-8');
      
      await setResultsFile(this.scanId, filePath);
    } catch (error) {
      // Do not throw, just continue
    }
  }
  
  private formatDuration(startTime: string, endTime: string): string {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const diffMs = end - start;
    
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private async scanCommits(startFrom: string | null, totalProcessedSoFar: number): Promise<number> {
    let totalProcessed = totalProcessedSoFar;
    
    console.log(`[${this.scanId}] Fetching commit history...`);
    
    // Fetch all commits (GitHub returns newest to oldest)
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

        // Collect commit SHAs
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
    
    // Reverse to get oldest to newest
    allCommits.reverse();
    
    console.log(`[${this.scanId}] Found ${allCommits.length} total commits`);
    
    // Find starting point if resuming
    let startIndex = 0;
    if (startFrom) {
      const checkpointIndex = allCommits.indexOf(startFrom);
      if (checkpointIndex !== -1) {
        // Start from the commit AFTER the checkpoint
        startIndex = checkpointIndex + 1;
        console.log(`[${this.scanId}] Resuming from commit ${startIndex + 1}/${allCommits.length}`);
      } else {
        console.log(`[${this.scanId}] Checkpoint commit not found, starting from beginning`);
      }
    } else {
      console.log(`[${this.scanId}] Starting from oldest commit`);
    }
    
    // Process commits from oldest to newest
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
      const committer = commit.commit.committer?.name || commit.commit.author?.name || 'Unknown';
      const committerEmail = commit.commit.committer?.email || commit.commit.author?.email || '';
      const committerInfo = committerEmail ? `${committer} <${committerEmail}>` : committer;
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
      // Parse hunk headers to get starting line number
      // Format: @@ -oldStart,oldLines +newStart,newLines @@
      if (line.startsWith('@@')) {
        const match = line.match(/@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
        if (match) {
          currentLineNumber = parseInt(match[1], 10);
        }
        continue;
      }
      
      // Process added lines
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const content = line.substring(1);
        const secrets = detectSecrets(content);
        
        for (const secret of secrets) {
          console.log(`[${this.scanId}] 🔍 Found ${secret.type} in ${filename}:${currentLineNumber} (commit: ${commitSha.substring(0, 7)})`);
          
          const commitUrl = `https://github.com/${this.owner}/${this.repo}/commit/${commitSha}`;
          
          const finding: Finding = {
            commit: commitSha,
            commitUrl: commitUrl,
            committer: committer,
            timestamp: timestamp,
            file: filename,
            line: currentLineNumber,
            leakValue: secret.value,
            leakType: secret.type
          };
          
          await saveFinding(this.scanId, finding);
        }
        
        currentLineNumber++;
      } else if (!line.startsWith('-')) {
        // Context lines (not removed, not added) also increment line number
        currentLineNumber++;
      }
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


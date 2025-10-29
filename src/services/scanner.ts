import { Octokit } from '@octokit/rest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Finding } from '../types';
import { detectsecrets } from '../utils/secrets';
import { savecheckpoint, getcheckpoint, savefinding, setstatus, setprogress, setstarttime, setendtime, setresultsfile, getfindings } from './redis';

export class GitHubScanner {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private scanid: string;

  constructor(githubtoken: string, repository: string, scanid: string) {
    this.octokit = new Octokit({ auth: githubtoken });
    const parts = repository.split('/');
    this.owner = parts[0];
    this.repo = parts[1];
    this.scanid = scanid;
  }

  async scan(): Promise<void> {
    const starttime = new Date().toISOString();
    
    try {
      await setstatus(this.scanid, 'in-progress');
      await setstarttime(this.scanid, starttime);
      
      const checkpoint = await getcheckpoint(this.scanid);
      const startfrom = checkpoint ? checkpoint.lastcommitsha : null;
      
      await this.scancommits(startfrom);
      
      const endtime = new Date().toISOString();
      await setendtime(this.scanid, endtime);
      
      await this.saveresultstofile();
      
      await setstatus(this.scanid, 'completed');
      await setprogress(this.scanid, 'Scan completed');
    } catch (error) {
      await setstatus(this.scanid, 'failed');
      await setprogress(this.scanid, `Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async saveresultstofile(): Promise<void> {
    try {
      const resultsdirectory = join(process.cwd(), 'results');
      
      try {
        await fs.access(resultsdirectory);
      } catch {
        await fs.mkdir(resultsdirectory, { recursive: true });
      }
      
      const filename = `scan_${this.scanid}_results.json`;
      const filepath = join(resultsdirectory, filename);
      
      const findings = await getfindings(this.scanid);
      
      const resultsdata = {
        scanid: this.scanid,
        repository: `${this.owner}/${this.repo}`,
        totalfindings: findings.length,
        scandate: new Date().toISOString(),
        findings: findings
      };
      
      await fs.writeFile(filepath, JSON.stringify(resultsdata, null, 2), 'utf-8');
      
      await setresultsfile(this.scanid, filepath);
    } catch (error) {
      // Do not throw, just continue
    }
  }

  private async scancommits(startfrom: string | null): Promise<void> {
    let page = 1;
    let foundstartpoint = startfrom === null;
    let totalprocessed = 0;

    while (true) {
      try {
        const response = await this.octokit.repos.listCommits({
          owner: this.owner,
          repo: this.repo,
          per_page: 100,
          page: page
        });

        await this.handleratelimit(response);

        if (response.data.length === 0) {
          break;
        }

        for (const commit of response.data) {
          if (!foundstartpoint) {
            if (commit.sha === startfrom) {
              foundstartpoint = true;
            }
            continue;
          }

          await this.processcommit(commit.sha);
          totalprocessed++;

          await savecheckpoint(this.scanid, {
            lastcommitsha: commit.sha,
            timestamp: new Date().toISOString(),
            totalcommits: totalprocessed
          });

          await setprogress(this.scanid, `Processed ${totalprocessed} commits`);
        }

        if (response.data.length < 100) {
          break;
        }

        page++;
      } catch (error) {
        if (this.isratelimiterror(error)) {
          await this.waitforratelimit();
          continue;
        }
        throw error;
      }
    }
  }

  private async processcommit(commitsha: string): Promise<void> {
    try {
      console.log(`[${this.scanid}] Processing commit: ${commitsha}`);
      
      const commitdetails = await this.octokit.repos.getCommit({
        owner: this.owner,
        repo: this.repo,
        ref: commitsha
      });

      await this.handleratelimit(commitdetails);

      const commit = commitdetails.data;
      const committer = commit.commit.committer?.name || commit.commit.author?.name || 'Unknown';
      const committeremail = commit.commit.committer?.email || commit.commit.author?.email || '';
      const committerinfo = committeremail ? `${committer} <${committeremail}>` : committer;
      const timestamp = commit.commit.committer?.date || commit.commit.author?.date || new Date().toISOString();

      if (commit.files) {
        for (const file of commit.files) {
          if (file.patch) {
            await this.scandiff(file.patch, commitsha, committerinfo, timestamp, file.filename);
          }
        }
      }
    } catch (error) {
      if (this.isratelimiterror(error)) {
        await this.waitforratelimit();
        await this.processcommit(commitsha);
      }
    }
  }

  private async scandiff(
    patch: string,
    commitsha: string,
    committer: string,
    timestamp: string,
    filename: string
  ): Promise<void> {
    const lines = patch.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const content = line.substring(1);
        const secrets = detectsecrets(content);
        
        for (const secret of secrets) {
          console.log(`[${this.scanid}] 🔍 Found ${secret.type} in ${filename} (commit: ${commitsha.substring(0, 7)})`);
          
          const finding: Finding = {
            commit: commitsha,
            committer: committer,
            timestamp: timestamp,
            file: filename,
            leakvalue: secret.value,
            leaktype: secret.type
          };
          
          await savefinding(this.scanid, finding);
        }
      }
    }
  }

  private async handleratelimit(response: any): Promise<void> {
    const remaining = response.headers['x-ratelimit-remaining'];
    const reset = response.headers['x-ratelimit-reset'];
    
    if (remaining && parseInt(remaining) < 10) {
      const resettime = parseInt(reset) * 1000;
      const now = Date.now();
      const waitmillis = resettime - now + 1000;
      
      if (waitmillis > 0) {
        await this.sleep(waitmillis);
      }
    }
  }

  private isratelimiterror(error: any): boolean {
    return error.status === 403 || error.status === 429;
  }

  private async waitforratelimit(): Promise<void> {
    await this.sleep(60000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}


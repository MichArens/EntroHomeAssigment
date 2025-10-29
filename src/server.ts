import express, { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { join } from 'path';
import { GitHubScanner } from './services/scanner';
import { initredis, getfindings, getstatus, getprogress, deletescan, closeredis, getstarttime, getendtime, getresultsfile, setrepository, getrepository, getallscanids } from './services/redis';
import { ScanRequest, ScanStatus, ScanResults, Finding } from './types';

dotenv.config();

const app = express();
app.use(express.json());

const githubtoken = process.env.githubtoken || process.env.GITHUB_TOKEN || '';
const redisurl = process.env.redisurl || process.env.REDIS_URL || 'redis://localhost:6379';
const port = parseInt(process.env.port || process.env.PORT || '3000');

if (!githubtoken) {
  throw new Error('GitHub token not provided. Set githubtoken environment variable.');
}

let isredisinitialized = false;

async function ensureredis() {
  if (!isredisinitialized) {
    await initredis(redisurl);
    isredisinitialized = true;
    await recoverscansonrestart();
  }
}

async function recoverscansonrestart() {
  try {
    console.log('Checking for in-progress scans to recover...');
    const allscanids = await getallscanids();
    
    if (allscanids.length === 0) {
      console.log('No scans found in Redis.');
      return;
    }
    
    console.log(`Found ${allscanids.length} scan(s) in Redis, checking status...`);
    
    // Get all scan statuses in parallel
    const scanstatuses = await Promise.all(
      allscanids.map(async (scanid) => ({
        scanid,
        status: await getstatus(scanid),
        repository: await getrepository(scanid)
      }))
    );
    
    // Filter for in-progress scans
    const inprogressscans = scanstatuses.filter(
      (scan) => scan.status === 'in-progress' && scan.repository
    );
    
    if (inprogressscans.length === 0) {
      console.log('No in-progress scans to recover.');
      return;
    }
    
    console.log(`Resuming ${inprogressscans.length} in-progress scan(s)...`);
    
    // Resume all scans in parallel
    inprogressscans.forEach((scan) => {
      console.log(`  - Resuming scan: ${scan.scanid} for repository: ${scan.repository}`);
      const scanner = new GitHubScanner(githubtoken, scan.repository!, scan.scanid);
      scanner.scan().catch(() => {});
    });
    
    console.log('Scan recovery process completed.');
  } catch (error) {
    console.error('Error recovering scans:', error);
  }
}

async function loadresultsfromfile(scanid: string): Promise<any | null> {
  try {
    const resultsdirectory = join(process.cwd(), 'results');
    const filename = `scan_${scanid}_results.json`;
    const filepath = join(resultsdirectory, filename);
    
    const filecontent = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(filecontent);
  } catch (error) {
    return null;
  }
}

app.post('/api/scan', async (req: Request, res: Response) => {
  try {
    const scanrequest: ScanRequest = req.body;
    
    if (!scanrequest.repository) {
      res.status(400).json({ error: 'Repository is required' });
      return;
    }
    
    if (!scanrequest.repository.includes('/')) {
      res.status(400).json({ error: 'Repository must be in format owner/repo' });
      return;
    }
    
    const scanid = scanrequest.scanid || generateid();
    
    const existingstatus = await getstatus(scanid);
    if (existingstatus === 'in-progress') {
      res.status(400).json({ error: 'Scan already in progress', scanid });
      return;
    }
    
    res.status(202).json({ 
      message: 'Scan started',
      scanid: scanid,
      statusurl: `/api/scan/${scanid}/status`,
      resultsurl: `/api/scan/${scanid}/results`
    });
    
    await setrepository(scanid, scanrequest.repository);
    
    const scanner = new GitHubScanner(githubtoken, scanrequest.repository, scanid);
    scanner.scan().catch(() => {});
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/scan/:scanid/status', async (req: Request, res: Response) => {
  try {
    const scanid = req.params.scanid;
    
    const status = await getstatus(scanid);
    
    // If not in Redis, try loading from file
    if (!status) {
      const filedata = await loadresultsfromfile(scanid);
      if (filedata) {
        const response: ScanStatus = {
          status: 'completed',
          progress: 'Scan completed',
          findings: filedata.findings || [],
          starttime: filedata.starttime,
          elapsedtime: filedata.duration
        };
        res.json(response);
        return;
      }
      
      res.status(404).json({ error: 'Scan not found' });
      return;
    }
    
    const progress = await getprogress(scanid) || 'Starting scan...';
    const findings = await getfindings(scanid);
    const starttime = await getstarttime(scanid);
    
    const response: ScanStatus = {
      status: status as 'in-progress' | 'completed' | 'failed',
      progress: progress,
      findings: findings,
      starttime: starttime || undefined,
      elapsedtime: starttime ? calculateelapsedtime(starttime) : undefined
    };
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/scan/:scanid/results', async (req: Request, res: Response) => {
  try {
    const scanid = req.params.scanid;
    
    const status = await getstatus(scanid);
    
    // If not in Redis, try loading from file
    if (!status) {
      const filedata = await loadresultsfromfile(scanid);
      if (filedata) {
        const resultsdirectory = join(process.cwd(), 'results');
        const filename = `scan_${scanid}_results.json`;
        const filepath = join(resultsdirectory, filename);
        
        const response: ScanResults = {
          scanid: filedata.scanid || scanid,
          status: 'completed',
          totalfindings: filedata.totalfindings || 0,
          findings: filedata.findings || [],
          starttime: filedata.starttime,
          endtime: filedata.endtime,
          duration: filedata.duration,
          resultsfile: filepath
        };
        res.json(response);
        return;
      }
      
      res.status(404).json({ error: 'Scan not found' });
      return;
    }
    
    const findings = await getfindings(scanid);
    const starttime = await getstarttime(scanid);
    const endtime = await getendtime(scanid);
    const resultsfile = await getresultsfile(scanid);
    
    const response: ScanResults = {
      scanid: scanid,
      status: status,
      totalfindings: findings.length,
      findings: findings,
      starttime: starttime || undefined,
      endtime: endtime || undefined,
      duration: starttime && endtime ? formatduration(starttime, endtime) : undefined,
      resultsfile: resultsfile || undefined
    };
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.delete('/api/scan/:scanid', async (req: Request, res: Response) => {
  try {
    const scanid = req.params.scanid;
    
    await deletescan(scanid);
    
    res.json({ message: 'Scan data deleted', scanid: scanid });
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

function generateid(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function formatduration(starttime: string, endtime: string): string {
  const start = new Date(starttime).getTime();
  const end = new Date(endtime).getTime();
  const diffms = end - start;
  
  const seconds = Math.floor(diffms / 1000);
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

function calculateelapsedtime(starttime: string): string {
  return formatduration(starttime, new Date().toISOString());
}

const server = app.listen(port, async () => {
  console.log(`Server started on port ${port}`);
  await ensureredis();
  console.log('Server ready to accept requests');
});

process.on('SIGTERM', async () => {
  await closeredis();
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  await closeredis();
  server.close(() => {
    process.exit(0);
  });
});


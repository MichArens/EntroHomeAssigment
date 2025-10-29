import express, { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { join } from 'path';
import { GitHubScanner } from './services/scanner';
import { initRedis, getFindings, getStatus, getProgress, deleteScan, closeRedis, getStartTime, getEndTime, getResultsFile, setRepository, getRepository, getAllScanIds } from './services/redis';
import { ScanRequest, ScanStatus, ScanResults, Finding } from './types';

dotenv.config();

const app = express();
app.use(express.json());

const githubToken = process.env.githubtoken || process.env.GITHUB_TOKEN || '';
const redisUrl = process.env.redisurl || process.env.REDIS_URL || 'redis://localhost:6379';
const port = parseInt(process.env.port || process.env.PORT || '3000');

if (!githubToken) {
  throw new Error('GitHub token not provided. Set githubtoken environment variable.');
}

let isRedisInitialized = false;

async function ensureRedis() {
  if (!isRedisInitialized) {
    await initRedis(redisUrl);
    isRedisInitialized = true;
    await recoverScansOnRestart();
  }
}

async function recoverScansOnRestart() {
  try {
    console.log('Checking for in-progress scans to recover...');
    const allScanIds = await getAllScanIds();
    
    if (allScanIds.length === 0) {
      console.log('No scans found in Redis.');
      return;
    }
    
    console.log(`Found ${allScanIds.length} scan(s) in Redis, checking status...`);
    
    // Get all scan statuses in parallel
    const scanStatuses = await Promise.all(
      allScanIds.map(async (scanId) => ({
        scanId,
        status: await getStatus(scanId),
        repository: await getRepository(scanId)
      }))
    );
    
    // Filter for in-progress scans
    const inProgressScans = scanStatuses.filter(
      (scan) => scan.status === 'in-progress' && scan.repository
    );
    
    if (inProgressScans.length === 0) {
      console.log('No in-progress scans to recover.');
      return;
    }
    
    console.log(`Resuming ${inProgressScans.length} in-progress scan(s)...`);
    
    // Resume all scans in parallel
    inProgressScans.forEach((scan) => {
      console.log(`  - Resuming scan: ${scan.scanId} for repository: ${scan.repository}`);
      const scanner = new GitHubScanner(githubToken, scan.repository!, scan.scanId);
      scanner.scan().catch(() => {});
    });
    
    console.log('Scan recovery process completed.');
  } catch (error) {
    console.error('Error recovering scans:', error);
  }
}

async function loadResultsFromFile(scanId: string): Promise<any | null> {
  try {
    const resultsDirectory = join(process.cwd(), 'results');
    const filename = `scan_${scanId}_results.json`;
    const filePath = join(resultsDirectory, filename);
    
    const fileContent = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    return null;
  }
}

app.post('/api/scan', async (req: Request, res: Response) => {
  try {
    const scanRequest: ScanRequest = req.body;
    
    if (!scanRequest.repository) {
      res.status(400).json({ error: 'Repository is required' });
      return;
    }
    
    if (!scanRequest.repository.includes('/')) {
      res.status(400).json({ error: 'Repository must be in format owner/repo' });
      return;
    }
    
    const scanId = scanRequest.scanId || generateId();
    
    const existingStatus = await getStatus(scanId);
    if (existingStatus === 'in-progress') {
      res.status(400).json({ error: 'Scan already in progress', scanId });
      return;
    }
    
    res.status(202).json({ 
      message: 'Scan started',
      scanId: scanId,
      statusUrl: `/api/scan/${scanId}/status`,
      resultsUrl: `/api/scan/${scanId}/results`
    });
    
    await setRepository(scanId, scanRequest.repository);
    
    const scanner = new GitHubScanner(githubToken, scanRequest.repository, scanId);
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
    const scanId = req.params.scanid;
    
    const status = await getStatus(scanId);
    
    // If not in Redis, try loading from file
    if (!status) {
      const fileData = await loadResultsFromFile(scanId);
      if (fileData) {
        const totalCommits = fileData.totalCommits || 0;
        const response: ScanStatus = {
          status: 'completed',
          progress: { current: totalCommits, total: totalCommits },
          findings: fileData.findings || [],
          startTime: fileData.startTime,
          elapsedTime: fileData.duration
        };
        res.json(response);
        return;
      }
      
      res.status(404).json({ error: 'Scan not found' });
      return;
    }
    
    const progress = await getProgress(scanId) || { current: 0, total: 0 };
    const findings = await getFindings(scanId);
    const startTime = await getStartTime(scanId);
    
    const response: ScanStatus = {
      status: status as 'in-progress' | 'completed' | 'failed',
      progress: progress,
      findings: findings,
      startTime: startTime || undefined,
      elapsedTime: startTime ? calculateElapsedTime(startTime) : undefined
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
    const scanId = req.params.scanid;
    
    const status = await getStatus(scanId);
    
    // If not in Redis, try loading from file
    if (!status) {
      const fileData = await loadResultsFromFile(scanId);
      if (fileData) {
        const resultsDirectory = join(process.cwd(), 'results');
        const filename = `scan_${scanId}_results.json`;
        const filePath = join(resultsDirectory, filename);
        
        const response: ScanResults = {
          scanId: fileData.scanId || scanId,
          status: 'completed',
          totalFindings: fileData.totalFindings || 0,
          findings: fileData.findings || [],
          startTime: fileData.startTime,
          endTime: fileData.endTime,
          duration: fileData.duration,
          resultsFile: filePath
        };
        res.json(response);
        return;
      }
      
      res.status(404).json({ error: 'Scan not found' });
      return;
    }
    
    const findings = await getFindings(scanId);
    const startTime = await getStartTime(scanId);
    const endTime = await getEndTime(scanId);
    const resultsFile = await getResultsFile(scanId);
    
    const response: ScanResults = {
      scanId: scanId,
      status: status,
      totalFindings: findings.length,
      findings: findings,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      duration: startTime && endTime ? formatDuration(startTime, endTime) : undefined,
      resultsFile: resultsFile || undefined
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
    const scanId = req.params.scanid;
    
    await deleteScan(scanId);
    
    res.json({ message: 'Scan data deleted', scanId: scanId });
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/results', async (req: Request, res: Response) => {
  try {
    // Get scan IDs from Redis
    const redisScanIds = await getAllScanIds();
    
    // Get scan IDs from results directory
    const resultsDirectory = join(process.cwd(), 'results');
    let fileScanIds: string[] = [];
    
    try {
      const files = await fs.readdir(resultsDirectory);
      fileScanIds = files
        .filter(file => file.startsWith('scan_') && file.endsWith('_results.json'))
        .map(file => {
          // Extract scan ID from filename: scan_{scanId}_results.json
          const match = file.match(/^scan_(.+)_results\.json$/);
          return match ? match[1] : null;
        })
        .filter((id): id is string => id !== null);
    } catch (error) {
      // Directory doesn't exist or can't be read, just use Redis IDs
    }
    
    // Combine and deduplicate
    const allScanIds = [...new Set([...redisScanIds, ...fileScanIds])];
    
    res.json({ scanIds: allScanIds });
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

function generateId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function formatDuration(startTime: string, endTime: string): string {
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

function calculateElapsedTime(startTime: string): string {
  return formatDuration(startTime, new Date().toISOString());
}

const server = app.listen(port, async () => {
  console.log(`Server started on port ${port}`);
  await ensureRedis();
  console.log('Server ready to accept requests');
});

process.on('SIGTERM', async () => {
  await closeRedis();
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  await closeRedis();
  server.close(() => {
    process.exit(0);
  });
});


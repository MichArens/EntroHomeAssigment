import express, { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { join } from 'path';
import swaggerUi from 'swagger-ui-express';
import { GitHubScanner } from './services/scanner';
import { 
  initRedis, 
  getFindings, 
  getStatus, 
  getProgress, 
  deleteScan, 
  closeRedis, 
  getStartTime, 
  getEndTime, 
  getResultsFile, 
  setRepository, 
  getRepository, 
  getAllScanIds 
} from './services/redis';
import { ScanRequest, ScanStatus, ScanResults } from './types';
import { formatDuration, calculateElapsedTime } from './utils/time';
import { validateRepository, generateScanId } from './utils/validation';
import { loadResultsFromFile, buildStatusFromFile, buildResultsFromFile } from './utils/responses';
import { swaggerSpec } from './swagger';

dotenv.config();

const app = express();
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'AWS Secrets Scanner API',
  customCss: '.swagger-ui .topbar { display: none }'
}));

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
    
    const scanStatuses = await Promise.all(
      allScanIds.map(async (scanId) => ({
        scanId,
        status: await getStatus(scanId),
        repository: await getRepository(scanId)
      }))
    );
    
    const inProgressScans = scanStatuses.filter(
      (scan) => scan.status === 'in-progress' && scan.repository
    );
    
    if (inProgressScans.length === 0) {
      console.log('No in-progress scans to recover.');
      return;
    }
    
    console.log(`Resuming ${inProgressScans.length} in-progress scan(s)...`);
    
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

async function handleStartScan(req: Request, res: Response) {
  const scanRequest: ScanRequest = req.body;
  
  const validation = validateRepository(scanRequest.repository);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }
  
  const scanId = scanRequest.scanId || generateScanId();
  
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
}

async function handleGetScanStatus(req: Request, res: Response) {
  const scanId = req.params.scanid;
  
  const status = await getStatus(scanId);
  
  if (!status) {
    const fileData = await loadResultsFromFile(scanId);
    if (fileData) {
      res.json(buildStatusFromFile(scanId, fileData));
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
}

async function handleGetScanResults(req: Request, res: Response) {
  const scanId = req.params.scanid;
  
  const status = await getStatus(scanId);
  
  if (!status) {
    const fileData = await loadResultsFromFile(scanId);
    if (fileData) {
      res.json(buildResultsFromFile(scanId, fileData));
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
}

async function handleDeleteScan(req: Request, res: Response) {
  const scanId = req.params.scanid;
  await deleteScan(scanId);
  res.json({ message: 'Scan data deleted', scanId: scanId });
}

async function handleListAllScans(req: Request, res: Response) {
  const redisScanIds = await getAllScanIds();
  
  const resultsDirectory = join(process.cwd(), 'results');
  let fileScanIds: string[] = [];
  
  try {
    const files = await fs.readdir(resultsDirectory);
    fileScanIds = files
      .filter(file => file.startsWith('scan_') && file.endsWith('_results.json'))
      .map(file => {
        const match = file.match(/^scan_(.+)_results\.json$/);
        return match ? match[1] : null;
      })
      .filter((id): id is string => id !== null);
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  const allScanIds = [...new Set([...redisScanIds, ...fileScanIds])];
  res.json({ scanIds: allScanIds });
}

function handleError(res: Response, error: unknown) {
  res.status(500).json({ 
    error: 'Internal server error',
    message: error instanceof Error ? error.message : 'Unknown error'
  });
}

app.post('/api/scan', async (req: Request, res: Response) => {
  try {
    await handleStartScan(req, res);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/scan/:scanid/status', async (req: Request, res: Response) => {
  try {
    await handleGetScanStatus(req, res);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/scan/:scanid/results', async (req: Request, res: Response) => {
  try {
    await handleGetScanResults(req, res);
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/scan/:scanid', async (req: Request, res: Response) => {
  try {
    await handleDeleteScan(req, res);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/results', async (req: Request, res: Response) => {
  try {
    await handleListAllScans(req, res);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

function shutdownGracefully() {
  closeRedis().then(() => {
    server.close(() => {
      process.exit(0);
    });
  });
}

const server = app.listen(port, async () => {
  console.log(`Server started on port ${port}`);
  await ensureRedis();
  console.log('Server ready to accept requests');
});

process.on('SIGTERM', shutdownGracefully);
process.on('SIGINT', shutdownGracefully);

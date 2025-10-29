import { createClient } from 'redis';
import { Finding, Checkpoint } from '../types';

let redisClient: ReturnType<typeof createClient> | null = null;

export async function initRedis(redisUrl: string) {
  redisClient = createClient({ url: redisUrl });
  
  redisClient.on('error', (err) => {
    throw new Error(`Redis connection error: ${err.message}`);
  });
  
  await redisClient.connect();
}

export async function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
}

export async function saveCheckpoint(scanId: string, checkpoint: Checkpoint): Promise<void> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:checkpoint`;
  await client.set(key, JSON.stringify(checkpoint));
}

export async function getCheckpoint(scanId: string): Promise<Checkpoint | null> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:checkpoint`;
  const data = await client.get(key);
  
  if (!data) return null;
  return JSON.parse(data);
}

export async function saveFinding(scanId: string, finding: Finding): Promise<void> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:findings`;
  await client.rPush(key, JSON.stringify(finding));
}

export async function getFindings(scanId: string): Promise<Finding[]> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:findings`;
  const data = await client.lRange(key, 0, -1);
  
  return data.map(item => JSON.parse(item));
}

export async function setStatus(scanId: string, status: string): Promise<void> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:status`;
  await client.set(key, status);
}

export async function getStatus(scanId: string): Promise<string | null> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:status`;
  return await client.get(key);
}

export async function setProgress(scanId: string, progress: { current: number; total: number }): Promise<void> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:progress`;
  await client.set(key, JSON.stringify(progress));
}

export async function getProgress(scanId: string): Promise<{ current: number; total: number } | null> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:progress`;
  const data = await client.get(key);
  
  if (!data) return null;
  
  return JSON.parse(data);
}

export async function setStartTime(scanId: string, startTime: string): Promise<void> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:starttime`;
  await client.set(key, startTime);
}

export async function getStartTime(scanId: string): Promise<string | null> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:starttime`;
  return await client.get(key);
}

export async function setEndTime(scanId: string, endTime: string): Promise<void> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:endtime`;
  await client.set(key, endTime);
}

export async function getEndTime(scanId: string): Promise<string | null> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:endtime`;
  return await client.get(key);
}

export async function setResultsFile(scanId: string, filePath: string): Promise<void> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:resultsfile`;
  await client.set(key, filePath);
}

export async function getResultsFile(scanId: string): Promise<string | null> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:resultsfile`;
  return await client.get(key);
}

export async function setRepository(scanId: string, repository: string): Promise<void> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:repository`;
  await client.set(key, repository);
}

export async function getRepository(scanId: string): Promise<string | null> {
  const client = await getRedisClient();
  const key = `scan:${scanId}:repository`;
  return await client.get(key);
}

export async function getAllScanIds(): Promise<string[]> {
  const client = await getRedisClient();
  const scanIds = new Set<string>();
  
  let cursor = 0;
  do {
    const result = await client.scan(cursor, {
      MATCH: 'scan:*',
      COUNT: 100
    });
    
    cursor = result.cursor;
    
    for (const key of result.keys) {
      const match = key.match(/^scan:([^:]+):/);
      if (match) {
        scanIds.add(match[1]);
      }
    }
  } while (cursor !== 0);
  
  return Array.from(scanIds);
}

export async function deleteScan(scanId: string): Promise<void> {
  const client = await getRedisClient();
  const keys = [
    `scan:${scanId}:checkpoint`,
    `scan:${scanId}:findings`,
    `scan:${scanId}:status`,
    `scan:${scanId}:progress`,
    `scan:${scanId}:starttime`,
    `scan:${scanId}:endtime`,
    `scan:${scanId}:resultsfile`,
    `scan:${scanId}:repository`
  ];
  
  for (const key of keys) {
    await client.del(key);
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
  }
}


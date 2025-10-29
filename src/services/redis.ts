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

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
  }
}

function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
}

function buildKey(scanId: string, field: string): string {
  return `scan:${scanId}:${field}`;
}

async function setRedisValue(scanId: string, field: string, value: string): Promise<void> {
  const client = getRedisClient();
  await client.set(buildKey(scanId, field), value);
}

async function getRedisValue(scanId: string, field: string): Promise<string | null> {
  const client = getRedisClient();
  return await client.get(buildKey(scanId, field));
}

async function setRedisJson<T>(scanId: string, field: string, value: T): Promise<void> {
  await setRedisValue(scanId, field, JSON.stringify(value));
}

async function getRedisJson<T>(scanId: string, field: string): Promise<T | null> {
  const data = await getRedisValue(scanId, field);
  return data ? JSON.parse(data) : null;
}

export async function saveCheckpoint(scanId: string, checkpoint: Checkpoint): Promise<void> {
  await setRedisJson(scanId, 'checkpoint', checkpoint);
}

export async function getCheckpoint(scanId: string): Promise<Checkpoint | null> {
  return getRedisJson<Checkpoint>(scanId, 'checkpoint');
}

export async function saveFinding(scanId: string, finding: Finding): Promise<void> {
  const client = getRedisClient();
  await client.rPush(buildKey(scanId, 'findings'), JSON.stringify(finding));
}

export async function getFindings(scanId: string): Promise<Finding[]> {
  const client = getRedisClient();
  const data = await client.lRange(buildKey(scanId, 'findings'), 0, -1);
  return data.map(item => JSON.parse(item));
}

export async function setStatus(scanId: string, status: string): Promise<void> {
  await setRedisValue(scanId, 'status', status);
}

export async function getStatus(scanId: string): Promise<string | null> {
  return getRedisValue(scanId, 'status');
}

export async function setProgress(scanId: string, progress: { current: number; total: number }): Promise<void> {
  await setRedisJson(scanId, 'progress', progress);
}

export async function getProgress(scanId: string): Promise<{ current: number; total: number } | null> {
  return getRedisJson<{ current: number; total: number }>(scanId, 'progress');
}

export async function setStartTime(scanId: string, startTime: string): Promise<void> {
  await setRedisValue(scanId, 'starttime', startTime);
}

export async function getStartTime(scanId: string): Promise<string | null> {
  return getRedisValue(scanId, 'starttime');
}

export async function setEndTime(scanId: string, endTime: string): Promise<void> {
  await setRedisValue(scanId, 'endtime', endTime);
}

export async function getEndTime(scanId: string): Promise<string | null> {
  return getRedisValue(scanId, 'endtime');
}

export async function setResultsFile(scanId: string, filePath: string): Promise<void> {
  await setRedisValue(scanId, 'resultsfile', filePath);
}

export async function getResultsFile(scanId: string): Promise<string | null> {
  return getRedisValue(scanId, 'resultsfile');
}

export async function setRepository(scanId: string, repository: string): Promise<void> {
  await setRedisValue(scanId, 'repository', repository);
}

export async function getRepository(scanId: string): Promise<string | null> {
  return getRedisValue(scanId, 'repository');
}

export async function getAllScanIds(): Promise<string[]> {
  const client = getRedisClient();
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
  const client = getRedisClient();
  const fields = ['checkpoint', 'findings', 'status', 'progress', 'starttime', 'endtime', 'resultsfile', 'repository'];
  const keys = fields.map(field => buildKey(scanId, field));
  
  for (const key of keys) {
    await client.del(key);
  }
}

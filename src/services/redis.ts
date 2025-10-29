import { createClient } from 'redis';
import { Finding, Checkpoint } from '../types';

let redisclient: ReturnType<typeof createClient> | null = null;

export async function initredis(redisurl: string) {
  redisclient = createClient({ url: redisurl });
  
  redisclient.on('error', (err) => {
    throw new Error(`Redis connection error: ${err.message}`);
  });
  
  await redisclient.connect();
}

export async function getredisclient() {
  if (!redisclient) {
    throw new Error('Redis client not initialized');
  }
  return redisclient;
}

export async function savecheckpoint(scanid: string, checkpoint: Checkpoint): Promise<void> {
  const client = await getredisclient();
  const key = `scan:${scanid}:checkpoint`;
  await client.set(key, JSON.stringify(checkpoint));
}

export async function getcheckpoint(scanid: string): Promise<Checkpoint | null> {
  const client = await getredisclient();
  const key = `scan:${scanid}:checkpoint`;
  const data = await client.get(key);
  
  if (!data) return null;
  return JSON.parse(data);
}

export async function savefinding(scanid: string, finding: Finding): Promise<void> {
  const client = await getredisclient();
  const key = `scan:${scanid}:findings`;
  await client.rPush(key, JSON.stringify(finding));
}

export async function getfindings(scanid: string): Promise<Finding[]> {
  const client = await getredisclient();
  const key = `scan:${scanid}:findings`;
  const data = await client.lRange(key, 0, -1);
  
  return data.map(item => JSON.parse(item));
}

export async function setstatus(scanid: string, status: string): Promise<void> {
  const client = await getredisclient();
  const key = `scan:${scanid}:status`;
  await client.set(key, status);
}

export async function getstatus(scanid: string): Promise<string | null> {
  const client = await getredisclient();
  const key = `scan:${scanid}:status`;
  return await client.get(key);
}

export async function setprogress(scanid: string, progress: string): Promise<void> {
  const client = await getredisclient();
  const key = `scan:${scanid}:progress`;
  await client.set(key, progress);
}

export async function getprogress(scanid: string): Promise<string | null> {
  const client = await getredisclient();
  const key = `scan:${scanid}:progress`;
  return await client.get(key);
}

export async function setstarttime(scanid: string, starttime: string): Promise<void> {
  const client = await getredisclient();
  const key = `scan:${scanid}:starttime`;
  await client.set(key, starttime);
}

export async function getstarttime(scanid: string): Promise<string | null> {
  const client = await getredisclient();
  const key = `scan:${scanid}:starttime`;
  return await client.get(key);
}

export async function setendtime(scanid: string, endtime: string): Promise<void> {
  const client = await getredisclient();
  const key = `scan:${scanid}:endtime`;
  await client.set(key, endtime);
}

export async function getendtime(scanid: string): Promise<string | null> {
  const client = await getredisclient();
  const key = `scan:${scanid}:endtime`;
  return await client.get(key);
}

export async function setresultsfile(scanid: string, filepath: string): Promise<void> {
  const client = await getredisclient();
  const key = `scan:${scanid}:resultsfile`;
  await client.set(key, filepath);
}

export async function getresultsfile(scanid: string): Promise<string | null> {
  const client = await getredisclient();
  const key = `scan:${scanid}:resultsfile`;
  return await client.get(key);
}

export async function setrepository(scanid: string, repository: string): Promise<void> {
  const client = await getredisclient();
  const key = `scan:${scanid}:repository`;
  await client.set(key, repository);
}

export async function getrepository(scanid: string): Promise<string | null> {
  const client = await getredisclient();
  const key = `scan:${scanid}:repository`;
  return await client.get(key);
}

export async function getallscanids(): Promise<string[]> {
  const client = await getredisclient();
  const scanids = new Set<string>();
  
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
        scanids.add(match[1]);
      }
    }
  } while (cursor !== 0);
  
  return Array.from(scanids);
}

export async function deletescan(scanid: string): Promise<void> {
  const client = await getredisclient();
  const keys = [
    `scan:${scanid}:checkpoint`,
    `scan:${scanid}:findings`,
    `scan:${scanid}:status`,
    `scan:${scanid}:progress`,
    `scan:${scanid}:starttime`,
    `scan:${scanid}:endtime`,
    `scan:${scanid}:resultsfile`,
    `scan:${scanid}:repository`
  ];
  
  for (const key of keys) {
    await client.del(key);
  }
}

export async function closeredis(): Promise<void> {
  if (redisclient) {
    await redisclient.quit();
  }
}


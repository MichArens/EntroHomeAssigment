import { promises as fs } from 'fs';
import { join } from 'path';
import { ScanStatus, ScanResults } from '../types';

export async function loadResultsFromFile(scanId: string): Promise<any | null> {
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

export function buildStatusFromFile(scanId: string, fileData: any): ScanStatus {
  const totalCommits = fileData.totalCommits || 0;
  return {
    status: 'completed',
    progress: { current: totalCommits, total: totalCommits },
    findings: fileData.findings || [],
    startTime: fileData.startTime,
    elapsedTime: fileData.duration
  };
}

export function buildResultsFromFile(scanId: string, fileData: any): ScanResults {
  const resultsDirectory = join(process.cwd(), 'results');
  const filename = `scan_${scanId}_results.json`;
  const filePath = join(resultsDirectory, filename);
  
  return {
    scanId: fileData.scanId || scanId,
    status: 'completed',
    totalFindings: fileData.totalFindings || 0,
    findings: fileData.findings || [],
    startTime: fileData.startTime,
    endTime: fileData.endTime,
    duration: fileData.duration,
    resultsFile: filePath
  };
}


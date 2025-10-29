import { Finding } from './finding';

export interface ScanRequest {
  repository: string;
  scanId?: string;
}

export interface ScanStatus {
  status: 'in-progress' | 'completed' | 'failed';
  progress: string;
  findings: Finding[];
  startTime?: string;
  elapsedTime?: string;
}

export interface ScanResults {
  scanId: string;
  status: string;
  totalFindings: number;
  findings: Finding[];
  startTime?: string;
  endTime?: string;
  duration?: string;
  resultsFile?: string;
}


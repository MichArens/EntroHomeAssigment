import { Finding } from './finding';

export interface ScanRequest {
  repository: string;
  scanid?: string;
}

export interface ScanStatus {
  status: 'in-progress' | 'completed' | 'failed';
  progress: string;
  findings: Finding[];
  starttime?: string;
  elapsedtime?: string;
}

export interface ScanResults {
  scanid: string;
  status: string;
  totalfindings: number;
  findings: Finding[];
  starttime?: string;
  endtime?: string;
  duration?: string;
  resultsfile?: string;
}


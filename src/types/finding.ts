export interface Finding {
  commit: string;
  commitUrl: string;
  committer: string;
  timestamp: string;
  file: string;
  line: number;
  leakValue: string;
  leakType: string;
}


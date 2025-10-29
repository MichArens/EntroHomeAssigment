export interface Finding {
  commit: string;
  commitUrl: string;
  committer: string;
  timestamp: string;
  file: string;
  line: number;
  leakvalue: string;
  leaktype: string;
}


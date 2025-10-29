export function validateRepository(repository: string): { valid: boolean; error?: string } {
  if (!repository) {
    return { valid: false, error: 'Repository is required' };
  }
  
  if (!repository.includes('/')) {
    return { valid: false, error: 'Repository must be in format owner/repo' };
  }
  
  return { valid: true };
}

export function generateScanId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}


import { v4 as uuidv4 } from 'uuid';

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
  return uuidv4();
}


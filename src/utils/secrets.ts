export interface SecretPattern {
  name: string;
  pattern: RegExp;
}

const secretPatterns: SecretPattern[] = [
  // AWS Patterns Only
  {
    name: 'AWS_ACCESS_KEY_ID',
    pattern: /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g
  },
  {
    name: 'AWS_SECRET_ACCESS_KEY',
    pattern: /(?:aws_secret_access_key|aws_secret_key|secret_key)[\s]*[=:][\s]*['"]?([A-Za-z0-9/+=]{40})['"]?/gi
  },
  {
    name: 'AWS_SECRET_ACCESS_KEY_PATTERN',
    pattern: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g
  },
  {
    name: 'AWS_SESSION_TOKEN',
    pattern: /(?:aws_session_token|aws_token|session_token)[\s]*[=:][\s]*['"]?([A-Za-z0-9/+=]{100,})['"]?/gi
  },
  {
    name: 'AWS_ACCOUNT_ID',
    pattern: /(?:aws_account_id|aws_account)[\s]*[=:][\s]*['"]?(\d{12})['"]?/gi
  },
  {
    name: 'AWS_MWS_KEY',
    pattern: /amzn\.mws\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
  }
];

export interface SecretMatch {
  type: string;
  value: string;
}

export function detectSecrets(content: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  
  for (const secretPattern of secretPatterns) {
    const regex = new RegExp(secretPattern.pattern);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const value = match[1] || match[0];
      
      if (shouldIncludeMatch(secretPattern.name, value)) {
        matches.push({
          type: secretPattern.name,
          value: value.trim()
        });
      }
    }
  }
  
  return matches;
}

function shouldIncludeMatch(type: string, value: string): boolean {
  // Common false positive filters for all AWS secrets
  const valueLower = value.toLowerCase();
  
  // Filter out common test/example values
  const commonFalsePositives = [
    'example', 'sample', 'fake', 'test', 'demo', 'placeholder',
    'your_', 'your-', 'my_', 'my-', 'dummy', 'xxxxxxxx'
  ];
  
  for (const falsePositive of commonFalsePositives) {
    if (valueLower.includes(falsePositive)) {
      return false;
    }
  }
  
  // AWS Secret Access Key Pattern - special filtering for 40-char generic pattern
  if (type === 'AWS_SECRET_ACCESS_KEY_PATTERN') {
    if (value.length !== 40) return false;
    if (!/[A-Z]/.test(value)) return false;
    if (!/[a-z]/.test(value)) return false;
    if (!/[0-9]/.test(value)) return false;
    
    // Filter out URL/path patterns (common false positives)
    if (valueLower.includes('github') || valueLower.includes('http') || valueLower.includes('www')) {
      return false;
    }
    
    // Filter out file paths with common directory/file names
    const commonPathWords = ['src', 'dist', 'main', 'master', 'blob', 'tree', 'commit', 'docs', 'readme', 'contributing', 'license', 'config', 'package'];
    for (const word of commonPathWords) {
      if (valueLower.includes(word)) {
        return false;
      }
    }
    
    // Check for high entropy - real secrets should be more random
    if (hasLowEntropy(value)) {
      return false;
    }
  }
  
  return true;
}

// Calculate Shannon entropy to detect random-looking strings
function hasLowEntropy(str: string): boolean {
  const len = str.length;
  const frequencies: { [key: string]: number } = {};
  
  // Count character frequencies
  for (const char of str) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }
  
  // Calculate entropy
  let entropy = 0;
  for (const char in frequencies) {
    const p = frequencies[char] / len;
    entropy -= p * Math.log2(p);
  }
  
  // AWS secrets typically have entropy > 4.0
  // Readable paths like "com/DS4SD/docling/blob/main/CONTRIBUTING" have lower entropy
  return entropy < 3.5;
}


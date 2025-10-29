export interface SecretPattern {
  name: string;
  pattern: RegExp;
}

const secretPatterns: SecretPattern[] = [
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
  if (isCommonFalsePositive(value)) {
    return false;
  }
  
  if (type === 'AWS_SECRET_ACCESS_KEY_PATTERN') {
    return isValidAwsSecretPattern(value);
  }
  
  return true;
}

function isCommonFalsePositive(value: string): boolean {
  const valueLower = value.toLowerCase();
  
  const commonFalsePositives = [
    'example', 'sample', 'fake', 'test', 'demo', 'placeholder',
    'your_', 'your-', 'my_', 'my-', 'dummy', 'xxxxxxxx'
  ];
  
  return commonFalsePositives.some(falsePositive => valueLower.includes(falsePositive));
}

function isValidAwsSecretPattern(value: string): boolean {
  if (value.length !== 40) return false;
  if (!hasRequiredCharacterTypes(value)) return false;
  if (containsUrlOrPathPatterns(value)) return false;
  if (hasLowEntropy(value)) return false;
  
  return true;
}

function hasRequiredCharacterTypes(value: string): boolean {
  return /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
}

function containsUrlOrPathPatterns(value: string): boolean {
  const valueLower = value.toLowerCase();
  
  if (valueLower.includes('github') || valueLower.includes('http') || valueLower.includes('www')) {
    return true;
  }
  
  const commonPathWords = [
    'src', 'dist', 'main', 'master', 'blob', 'tree', 'commit', 
    'docs', 'readme', 'contributing', 'license', 'config', 'package'
  ];
  
  return commonPathWords.some(word => valueLower.includes(word));
}

function hasLowEntropy(str: string): boolean {
  const len = str.length;
  const frequencies: { [key: string]: number } = {};
  
  for (const char of str) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }
  
  let entropy = 0;
  for (const char in frequencies) {
    const p = frequencies[char] / len;
    entropy -= p * Math.log2(p);
  }
  
  return entropy < 3.5;
}

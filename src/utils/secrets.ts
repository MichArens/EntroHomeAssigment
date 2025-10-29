export interface SecretPattern {
  name: string;
  pattern: RegExp;
}

const secretpatterns: SecretPattern[] = [
  {
    name: 'AWS_ACCESS_KEY_ID',
    pattern: /AKIA[0-9A-Z]{16}/g
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
    pattern: /aws_account_id[\s]*[=:][\s]*['"]?(\d{12})['"]?/gi
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

export function detectsecrets(content: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  
  for (const secretpattern of secretpatterns) {
    const regex = new RegExp(secretpattern.pattern);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const value = match[1] || match[0];
      
      if (shouldincludematch(secretpattern.name, value)) {
        matches.push({
          type: secretpattern.name,
          value: value.trim()
        });
      }
    }
  }
  
  return matches;
}

function shouldincludematch(type: string, value: string): boolean {
  if (type === 'AWS_SECRET_ACCESS_KEY_PATTERN') {
    if (value.length !== 40) return false;
    if (!/[A-Z]/.test(value)) return false;
    if (!/[a-z]/.test(value)) return false;
    if (!/[0-9]/.test(value)) return false;
  }
  
  if (value.includes('example') || value.includes('EXAMPLE')) {
    return false;
  }
  
  if (value.includes('fake') || value.includes('FAKE')) {
    return false;
  }
  
  return true;
}


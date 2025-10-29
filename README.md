# AWS Secrets Scanner

A REST API service that scans GitHub repositories for leaked AWS credentials in commit history.

## Tech Stack

### Core Technologies
- **TypeScript/Node.js** - Type-safe runtime environment
- **Express** - Lightweight web framework for REST API
- **Octokit** - Official GitHub API SDK for repository access
- **Redis** - In-memory storage for scan state and checkpoints
- **Docker** - Containerization for consistent deployment

### Why This Stack?

- **TypeScript**: Provides type safety and better developer experience for complex data structures (scans, findings, checkpoints)
- **Express**: Minimal overhead, perfect for REST APIs, extensive middleware ecosystem
- **Octokit**: Official GitHub SDK handles authentication, rate limiting, and pagination automatically
- **Redis**: Fast in-memory storage ideal for scan state, supports resumable scans, and handles concurrent operations
- **Docker**: Ensures consistent environment across development and production, simplifies Redis setup

## Setup

### 1. Get GitHub Token

Create a personal access token at [github.com/settings/tokens](https://github.com/settings/tokens) with `repo` scope.

### 2. Configure Environment

**Windows (PowerShell):**
```powershell
.\setup.ps1
# Edit .env and add your GitHub token
```

**Mac/Linux:**
```bash
chmod +x setup.sh && ./setup.sh
# Edit .env and add your GitHub token
```

**Manual:** Create `.env` file:
```env
githubtoken=your_token_here
redisurl=redis://redis:6379
port=3000
```

### 3. Start Application

```bash
docker-compose up --build
```

The API will be available at `http://localhost:3000`

### 4. Test It

```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"repository": "octocat/Hello-World"}'
```

**Test Repository with Intentional Secrets:**

To test the scanner with a repository containing intentional AWS secrets, use:
```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"repository": "MichArens/EntroHomeAssigment-Test"}'
```

This test repository ([MichArens/EntroHomeAssigment-Test](https://github.com/MichArens/EntroHomeAssigment-Test)) contains 9 commits with various AWS credential types across multiple files, perfect for validating the scanner's detection capabilities.

For detailed API documentation and examples, see **[API_EXAMPLES.md](src/API_EXAMPLES.md)**

## How Scanning Works

### Scan Flow (Per Commit)

1. **Fetch Commit Data**
   - Retrieve commit metadata from GitHub API (SHA, author, timestamp)
   - Get list of files changed in the commit

2. **Get File Diffs**
   - Fetch diff for each modified file
   - Parse diff to identify added lines (ignore deletions)

3. **Scan Added Lines**
   - Run each added line through AWS secret detection patterns:
     - AWS Access Key ID (`AKIA...`)
     - AWS Secret Access Key (40-character keys)
     - AWS Session Tokens
     - AWS Account IDs
     - AWS MWS Keys
     - Additional AWS credential patterns

4. **Record Findings**
   - For each detected secret, store:
     - Secret type and value
     - File path and line number
     - Commit SHA, author, and timestamp
     - Confidence level (entropy-based validation)

5. **Save Checkpoint**
   - Store scan progress to Redis after each commit
   - Enables resume capability if scan is interrupted
   - Tracks: last processed commit SHA, total commits processed, findings count

6. **Continue to Next Commit**
   - Process commits in chronological order (newest to oldest)
   - Handle GitHub rate limits (auto-wait and retry)
   - Update scan status in Redis

7. **Complete Scan**
   - Export all findings to JSON file in `results/` directory
   - Calculate total duration and statistics
   - Mark scan as completed in Redis

### Resumable Scans

If a scan is interrupted, restart it with the same `scanid` - it will resume from the last checkpoint.

## Local Development

```bash
npm install
docker run -d -p 6379:6379 redis:7-alpine

export githubtoken=your_token
export redisurl=redis://localhost:6379
export port=3000

npm run dev
```

## License

MIT

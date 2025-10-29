# AWS Secrets Scanner

A web server application that scans GitHub repositories for leaked AWS secrets via REST API. Detects AWS Access Keys, Secret Keys, Session Tokens, and other credentials in commit diffs.

## Features

- REST API for scanning GitHub repositories
- Detects 6 types of AWS secrets and credentials
- Checkpoint/resume for interrupted scans
- Automatic timing tracking and results export to JSON
- Rate limit handling and pagination
- Redis-backed storage
- Fully containerized with Docker

## Quick Start

### 1. Get GitHub Token

Visit [github.com/settings/tokens](https://github.com/settings/tokens) and create a token with `repo` scope.

### 2. Setup Environment

**Windows (PowerShell):**
```powershell
.\setup.ps1
# Edit .env and add your token
```

**Mac/Linux:**
```bash
chmod +x setup.sh && ./setup.sh
# Edit .env and add your token
```

**Manual:** Create `.env` file:
```
githubtoken=your_token_here
redisurl=redis://redis:6379
port=3000
```

### 3. Start Application

```bash
docker-compose up --build
```

### 4. Scan a Repository

```bash
# Start scan
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"repository": "octocat/Hello-World"}'

# Check status (use scanid from response)
curl http://localhost:3000/api/scan/SCAN_ID/status

# Get results
curl http://localhost:3000/api/scan/SCAN_ID/results
```

See `src/API_EXAMPLES.md` for more examples.

## API Endpoints

### POST /api/scan
Start a new scan.

**Request:**
```json
{
  "repository": "owner/repo",
  "scanid": "optional-id-for-resuming"
}
```

**Response:**
```json
{
  "message": "Scan started",
  "scanid": "scan_1234567890_abc123",
  "statusurl": "/api/scan/scan_1234567890_abc123/status"
}
```

### GET /api/scan/:scanid/status
Check scan progress with timing.

**Response:**
```json
{
  "status": "in-progress",
  "progress": "Processed 50 commits",
  "starttime": "2025-01-15T10:00:00Z",
  "elapsedtime": "2m 15s",
  "findings": [...]
}
```

### GET /api/scan/:scanid/results
Get complete results with timing and file path.

**Response:**
```json
{
  "scanid": "scan_1234567890_abc123",
  "status": "completed",
  "totalfindings": 5,
  "starttime": "2025-01-15T10:00:00Z",
  "endtime": "2025-01-15T10:15:30Z",
  "duration": "15m 30s",
  "resultsfile": "/app/results/scan_scan_1234567890_abc123_results.json",
  "findings": [...]
}
```

Results are auto-saved to `results/` directory as JSON files.

### DELETE /api/scan/:scanid
Clear scan data from Redis.

## Resume Interrupted Scans

Use the same `scanid` to continue:

```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"repository": "owner/repo", "scanid": "previous-scan-id"}'
```

## Detected Secret Types

- `AWS_ACCESS_KEY_ID` - AKIA... format
- `AWS_SECRET_ACCESS_KEY` - 40-character keys
- `AWS_SESSION_TOKEN` - Session tokens
- `AWS_ACCOUNT_ID` - Account IDs
- `AWS_MWS_KEY` - Amazon MWS keys
- Additional AWS credential patterns

## Troubleshooting

**"GitHub token not provided"**
- Ensure `.env` exists with correct token
- Restart: `docker-compose down && docker-compose up`

**"Cannot connect to Redis"**
- Verify Docker is running
- Check: `docker-compose ps`

**Rate limits**
- GitHub API: 5000 requests/hour
- Scanner auto-handles with wait/retry

## Project Structure

```
src/
├── server.ts              ← Main Express server
├── services/
│   ├── redis.ts          ← Redis client & storage
│   └── scanner.ts        ← GitHub scanning logic
├── types/
│   ├── finding.ts        ← Finding interface
│   ├── scan.ts           ← Scan interfaces
│   ├── checkpoint.ts     ← Checkpoint interface
│   └── index.ts          ← Type exports
└── utils/
    └── secrets.ts        ← AWS secret detection
```

## Local Development

```bash
npm install
docker run -d -p 6379:6379 redis:7-alpine

export githubtoken=your_token
export redisurl=redis://localhost:6379
export port=3000

npm run dev
```

## Technical Details

- Scans commits in descending chronological order
- Processes all file diffs (added lines only)
- Stores checkpoint after each commit
- Automatic rate limit handling
- Variables use lowercase without delimiters
- Debug logs show commit processing

## Architecture

- **TypeScript/Node.js** - Runtime
- **Express** - Web framework
- **Octokit** - GitHub API SDK
- **Redis** - State storage
- **Docker** - Containerization

## License

MIT

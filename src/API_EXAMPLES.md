# API Examples

Complete API reference with request/response examples for the AWS Secrets Scanner.

## Features

- **Timing Information**: Status endpoint shows elapsed time, results endpoint shows total duration
- **Auto-save Results**: Scan findings are automatically saved to `results/scan_{scanid}_results.json` when complete
- **Resumable Scans**: Resume interrupted scans using the same `scanid`
- **Multiple Storage**: Results available from both Redis (active) and file system (completed)

## Health Check

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok"
}
```

## Start a Scan

### Scan a public repository

```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "octocat/Hello-World"
  }'
```

**Response (202 Accepted):**
```json
{
  "message": "Scan started",
  "scanId": "scan_1730217600_abc123",
  "statusUrl": "/api/scan/scan_1730217600_abc123/status",
  "resultsUrl": "/api/scan/scan_1730217600_abc123/results"
}
```

### Scan with a specific scan ID (for resuming)

```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "octocat/Hello-World",
    "scanId": "my-custom-scan-id"
  }'
```

**Response:**
```json
{
  "message": "Scan started",
  "scanId": "my-custom-scan-id",
  "statusUrl": "/api/scan/my-custom-scan-id/status",
  "resultsUrl": "/api/scan/my-custom-scan-id/results"
}
```

**Error Responses:**

Missing or invalid repository:
```json
{
  "error": "Repository is required and must be in format 'owner/repo'"
}
```

Scan already in progress:
```json
{
  "error": "Scan already in progress",
  "scanId": "scan_1730217600_abc123"
}
```

## Check Scan Status

Get real-time status of an active or completed scan.

```bash
curl http://localhost:3000/api/scan/SCAN_ID/status
```

**Example:**
```bash
curl http://localhost:3000/api/scan/scan_1730217600_abc123/status
```

**Response (In Progress):**
```json
{
  "status": "in-progress",
  "progress": {
    "current": 50,
    "total": 150
  },
  "findings": [
    {
      "commit": "a1b2c3d4e5f6",
      "commitUrl": "https://github.com/octocat/Hello-World/commit/a1b2c3d4e5f6",
      "committer": "octocat",
      "timestamp": "2025-01-15T10:05:30Z",
      "file": "config/aws.yml",
      "line": 42,
      "leakValue": "AKIAIOSFODNN7EXAMPLE",
      "leakType": "AWS_ACCESS_KEY_ID"
    }
  ],
  "startTime": "2025-01-15T10:00:00Z",
  "elapsedTime": "5m 30s"
}
```

**Response (Completed):**
```json
{
  "status": "completed",
  "progress": {
    "current": 150,
    "total": 150
  },
  "findings": [...],
  "startTime": "2025-01-15T10:00:00Z",
  "elapsedTime": "15m 30s"
}
```

**Error Response:**
```json
{
  "error": "Scan not found"
}
```

## Get Scan Results

Get complete results with all findings and timing information.

```bash
curl http://localhost:3000/api/scan/SCAN_ID/results
```

**Example:**
```bash
curl http://localhost:3000/api/scan/scan_1730217600_abc123/results
```

**Response:**
```json
{
  "scanId": "scan_1730217600_abc123",
  "status": "completed",
  "totalFindings": 3,
  "findings": [
    {
      "commit": "a1b2c3d4e5f6",
      "commitUrl": "https://github.com/octocat/Hello-World/commit/a1b2c3d4e5f6",
      "committer": "octocat",
      "timestamp": "2025-01-15T10:05:30Z",
      "file": "config/aws.yml",
      "line": 42,
      "leakValue": "AKIAIOSFODNN7EXAMPLE",
      "leakType": "AWS_ACCESS_KEY_ID"
    },
    {
      "commit": "b2c3d4e5f6a1",
      "commitUrl": "https://github.com/octocat/Hello-World/commit/b2c3d4e5f6a1",
      "committer": "developer",
      "timestamp": "2025-01-14T15:20:10Z",
      "file": "src/config.js",
      "line": 15,
      "leakValue": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      "leakType": "AWS_SECRET_ACCESS_KEY"
    }
  ],
  "startTime": "2025-01-15T10:00:00Z",
  "endTime": "2025-01-15T10:15:30Z",
  "duration": "15m 30s",
  "resultsFile": "/app/results/scan_scan_1730217600_abc123_results.json"
}
```

**Finding Object Structure:**
- `commit`: Git commit SHA
- `commitUrl`: Direct link to commit on GitHub
- `committer`: GitHub username who made the commit
- `timestamp`: When the commit was made (ISO 8601)
- `file`: Path to the file containing the secret
- `line`: Line number where secret was found
- `leakValue`: The actual secret value detected
- `leakType`: Type of AWS credential (see below)

**Detected Secret Types:**
- `AWS_ACCESS_KEY_ID` - Access keys starting with AKIA
- `AWS_SECRET_ACCESS_KEY` - 40-character secret keys
- `AWS_SESSION_TOKEN` - Session tokens
- `AWS_ACCOUNT_ID` - AWS account IDs
- `AWS_MWS_KEY` - Amazon Marketplace Web Service keys

**Error Response:**
```json
{
  "error": "Scan not found"
}
```

## Get All Scans

Get a list of all available scan IDs (both active and completed).

```bash
curl http://localhost:3000/api/results
```

**Response:**
```json
{
  "scanIds": [
    "scan_1730217600_abc123",
    "scan_1730218000_def456",
    "my-custom-scan-id"
  ]
}
```

This returns all scan IDs from both:
- **Redis**: Currently active/in-progress scans
- **File System**: Completed scans saved in `results/` directory

## Delete Scan Data

Clear scan data from Redis. This does NOT delete the results file.

```bash
curl -X DELETE http://localhost:3000/api/scan/SCAN_ID
```

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/scan/scan_1730217600_abc123
```

**Response:**
```json
{
  "message": "Scan data deleted",
  "scanId": "scan_1730217600_abc123"
}
```

**Note:** This only removes the scan from Redis. The results JSON file in `results/` directory remains intact.

## Resume an Interrupted Scan

If a scan is interrupted (server restart, crash, etc.), resume it using the same `scanId`. The scan will continue from the last checkpoint.

```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "octocat/Hello-World",
    "scanId": "scan_1730217600_abc123"
  }'
```

**Response:**
```json
{
  "message": "Scan started",
  "scanId": "scan_1730217600_abc123",
  "statusUrl": "/api/scan/scan_1730217600_abc123/status",
  "resultsUrl": "/api/scan/scan_1730217600_abc123/results"
}
```

**How it works:**
- Scans save checkpoints after each commit to Redis
- Resume uses the checkpoint to skip already-processed commits
- Findings from the previous run are preserved
- No duplicate scanning of commits

**Auto-Resume on Restart:**
The server automatically detects and resumes any in-progress scans when it starts up.

## Pretty Print JSON with jq

If you have `jq` installed, you can format the output:

```bash
curl http://localhost:3000/api/scan/SCAN_ID/results | jq .
```

## Watch Status Updates

Monitor scan progress in real-time:

```bash
watch -n 5 'curl -s http://localhost:3000/api/scan/SCAN_ID/status | jq .'
```

## PowerShell Examples (Windows)

### Start a scan
```powershell
$body = @{
    repository = "octocat/Hello-World"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/scan" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

### Check status
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/scan/SCAN_ID/status"
```

### Get results
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/scan/SCAN_ID/results"
```

### Get all results
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/results"
```


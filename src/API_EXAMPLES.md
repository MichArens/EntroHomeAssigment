# API Examples

This file contains example API calls for testing the AWS Secrets Scanner.

## New Features

- **Timing Information**: Status endpoint shows elapsed time, results endpoint shows total duration
- **Auto-save Results**: Scan findings are automatically saved to `results/scan_{scanid}_results.json` when complete

## Health Check

```bash
curl http://localhost:3000/health
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

### Scan with a specific scan ID

```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "octocat/Hello-World",
    "scanid": "my-custom-scan-id"
  }'
```

## Check Scan Status

Replace `SCAN_ID` with the actual scan ID from the previous response:

```bash
curl http://localhost:3000/api/scan/SCAN_ID/status
```

Example:
```bash
curl http://localhost:3000/api/scan/scan_1730217600_abc123/status
```

## Get Scan Results

```bash
curl http://localhost:3000/api/scan/SCAN_ID/results
```

Example:
```bash
curl http://localhost:3000/api/scan/scan_1730217600_abc123/results
```

## Delete Scan Data

```bash
curl -X DELETE http://localhost:3000/api/scan/SCAN_ID
```

Example:
```bash
curl -X DELETE http://localhost:3000/api/scan/scan_1730217600_abc123
```

## Resume an Interrupted Scan

To resume a scan, use the same `scanid`:

```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "octocat/Hello-World",
    "scanid": "scan_1730217600_abc123"
  }'
```

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


Write-Host "AWS Secrets Scanner - Setup Script" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

if (Test-Path .env) {
    Write-Host "[OK] .env file already exists" -ForegroundColor Green
} else {
    if (Test-Path .env-example) {
        Write-Host "Creating .env file from .env-example..." -ForegroundColor Yellow
        Copy-Item .env-example .env
        Write-Host "[OK] .env file created successfully" -ForegroundColor Green
        Write-Host ""
        Write-Host "[IMPORTANT] Edit .env and add your GitHub Personal Access Token" -ForegroundColor Yellow
        Write-Host "Get your token at: https://github.com/settings/tokens" -ForegroundColor Yellow
    } else {
        Write-Host "[ERROR] .env-example file not found" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Setup complete! Next steps:" -ForegroundColor Green
Write-Host "1. Edit .env and add your GitHub token"
Write-Host "2. Run: docker-compose up --build"
Write-Host "3. Access the API at http://localhost:3000"


Write-Host "AWS Secrets Scanner - Setup Script" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

if (Test-Path .env) {
    Write-Host "[OK] .env file already exists" -ForegroundColor Green
} else {
    Write-Host "Creating .env file..." -ForegroundColor Yellow
    
    $envContent = @"
githubtoken=your_github_personal_access_token_here
redisurl=redis://redis:6379
port=3000
"@
    
    Set-Content -Path .env -Value $envContent
    Write-Host "[OK] .env file created successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "[IMPORTANT] Edit .env and add your GitHub Personal Access Token" -ForegroundColor Yellow
    Write-Host "Get your token at: https://github.com/settings/tokens" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Setup complete! Next steps:" -ForegroundColor Green
Write-Host "1. Edit .env and add your GitHub token"
Write-Host "2. Run: docker-compose up --build"
Write-Host "3. Access the API at http://localhost:3000"


#!/bin/bash

echo "AWS Secrets Scanner - Setup Script"
echo "===================================="
echo ""

if [ -f .env ]; then
    echo "✓ .env file already exists"
else
    echo "Creating .env file..."
    cat > .env << EOF
githubtoken=your_github_personal_access_token_here
redisurl=redis://redis:6379
port=3000
EOF
    echo "✓ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env and add your GitHub Personal Access Token"
    echo "   Get your token at: https://github.com/settings/tokens"
fi

echo ""
echo "Setup complete! Next steps:"
echo "1. Edit .env and add your GitHub token"
echo "2. Run: docker-compose up --build"
echo "3. Access the API at http://localhost:3000"


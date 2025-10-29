#!/bin/bash

echo "AWS Secrets Scanner - Setup Script"
echo "===================================="
echo ""

if [ -f .env ]; then
    echo "✓ .env file already exists"
else
    if [ -f .env-example ]; then
        echo "Creating .env file from .env-example..."
        cp .env-example .env
        echo "✓ .env file created"
        echo ""
        echo "⚠️  IMPORTANT: Edit .env and add your GitHub Personal Access Token"
        echo "   Get your token at: https://github.com/settings/tokens"
    else
        echo "❌ ERROR: .env-example file not found"
        exit 1
    fi
fi

echo ""
echo "Setup complete! Next steps:"
echo "1. Edit .env and add your GitHub token"
echo "2. Run: docker-compose up --build"
echo "3. Access the API at http://localhost:3000"


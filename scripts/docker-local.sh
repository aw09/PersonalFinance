#!/bin/sh

# Local development script to build and run Docker with environment variables

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo "⚠️ Warning: .env file not found. Creating a sample one."
  echo "NEXT_PUBLIC_SUPABASE_URL=your-supabase-url-here" > .env
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-here" >> .env
  echo "Created .env file. Please edit it with your actual values."
  exit 1
fi

# Build the Docker image
echo "🔨 Building Docker image..."
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env | cut -d '=' -f2) \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env | cut -d '=' -f2) \
  -t personal-finance .

# Run the Docker container with environment variables
echo "🚀 Starting container..."
docker run -p 3000:3000 --env-file .env personal-finance

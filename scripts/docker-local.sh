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

# Helper to read an env var value from .env and strip surrounding quotes
get_env() {
  key="$1"
  # Get everything after the first '=' and strip surrounding single or double quotes
  val=$(grep "^${key}=" .env | cut -d'=' -f2-)
  # Remove surrounding double or single quotes if present
  val=$(printf '%s' "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  printf '%s' "$val"
}

# Build the Docker image
echo "🔨 Building Docker image..."
SUPABASE_URL=$(get_env NEXT_PUBLIC_SUPABASE_URL)
SUPABASE_KEY=$(get_env NEXT_PUBLIC_SUPABASE_ANON_KEY)
SITE_URL=$(get_env NEXT_PUBLIC_SITE_URL)

docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_KEY" \
  --build-arg NEXT_PUBLIC_SITE_URL="$SITE_URL" \
  -t personal-finance .

# Create a sanitized temp env file (strip surrounding quotes) for docker run
TMP_ENV_FILE=$(mktemp)
trap 'rm -f "$TMP_ENV_FILE"' EXIT
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|\#*) echo "$line" >> "$TMP_ENV_FILE" ;;
    *=*)
      key=$(printf '%s' "$line" | cut -d= -f1)
      val=$(printf '%s' "$line" | cut -d= -f2-)
      val=$(printf '%s' "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
      echo "$key=$val" >> "$TMP_ENV_FILE"
      ;;
    *) echo "$line" >> "$TMP_ENV_FILE" ;;
  esac
done < .env

# Run the Docker container with sanitized environment variables
echo "🚀 Starting container..."
docker run -p 3000:3000 --env-file "$TMP_ENV_FILE" personal-finance

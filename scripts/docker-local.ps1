# Local development script to build and run Docker with environment variables

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "⚠️ Warning: .env file not found. Creating a sample one."
    "NEXT_PUBLIC_SUPABASE_URL=your-supabase-url-here" | Out-File -FilePath ".env" -Encoding utf8
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-here" | Out-File -FilePath ".env" -Encoding utf8 -Append
    Write-Host "Created .env file. Please edit it with your actual values."
    exit 1
}

# Read environment variables from .env file
$envVars = Get-Content .env | Where-Object { $_ -match "=" } | ForEach-Object {
    $parts = $_ -split '=', 2
    @{
        Name = $parts[0]
        Value = $parts[1]
    }
}

# Extract the Supabase URL and key for build args
$supabaseUrl = ($envVars | Where-Object { $_.Name -eq "NEXT_PUBLIC_SUPABASE_URL" }).Value
$supabaseKey = ($envVars | Where-Object { $_.Name -eq "NEXT_PUBLIC_SUPABASE_ANON_KEY" }).Value

# Build the Docker image
Write-Host "🔨 Building Docker image..."
docker build `
    --build-arg NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl `
    --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$supabaseKey `
    -t personal-finance .

# Run the Docker container with environment variables
Write-Host "🚀 Starting container..."
docker run -p 3000:3000 --env-file .env personal-finance

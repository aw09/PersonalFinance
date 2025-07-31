# Deployment Guide

## Railway.app Deployment (Recommended)

### Prerequisites
- GitHub account with this repository
- Railway.app account
- Supabase project

### Step 1: Set up Supabase
1. Create a new project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor and run the `database/schema.sql` script
3. Get your project URL and anon key from Settings > API

### Step 2: Deploy to Railway
1. Visit [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select this repository
4. Set the following environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token (optional)
   OPENAI_API_KEY=your_openai_api_key (optional)
   ```
5. Deploy!

### Step 3: Set up Telegram Bot (Optional)
1. Create a bot with [@BotFather](https://t.me/botfather) on Telegram
2. Get your bot token and add it to Railway environment variables
3. Set webhook URL to: `https://your-railway-domain.railway.app/api/telegram/webhook`

## Alternative Deployment Options

### Vercel
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically

### Docker
1. Build the image: `docker build -t personal-finance .`
2. Run: `docker run -p 3000:3000 --env-file .env personal-finance`

### Self-hosted
1. Install Node.js 18+
2. Clone repository and run `npm install`
3. Set environment variables
4. Run `npm run build && npm start`

**Note:** This application uses Next.js standalone mode. After building, you can also run:
- `npm start` (recommended) 
- `node .next/standalone/server.js` (direct command)
- `npm run start:dev` (development mode with `next start`)

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Your Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | For admin operations |
| `TELEGRAM_BOT_TOKEN` | No | For Telegram bot integration |
| `OPENAI_API_KEY` | No | For AI-powered features |

## Post-Deployment Setup

1. Visit your deployed app
2. Create an account using the authentication system
3. Create your first wallet
4. Start tracking your finances!

## Monitoring and Maintenance

- Check Railway/Vercel logs for any errors
- Monitor Supabase dashboard for database usage
- Update environment variables as needed
- Keep dependencies updated with `npm update`
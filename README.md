# Personal Finance App

A comprehensive fullstack personal finance management application built with Next.js, Supabase, and Tailwind CSS.

## Features

### ✅ Implemented
- [x] User authentication with Supabase Auth
- [x] Responsive dashboard layout
- [x] Database schema for comprehensive finance tracking
- [x] Wallet management (create, view, list)
- [x] Transaction management (create, view, list)
- [x] Category support for transactions
- [x] Multi-currency support
- [x] Budget management and tracking
- [x] Basic Telegram bot integration
- [x] Investment tracking API

### 🚧 In Development  
- [ ] Loan and credit/receivables management
- [ ] Installment payment tracking
- [ ] Advanced investment portfolio features
- [ ] Scheduled/repeated transactions
- [ ] Item-level expense tracking for price monitoring
- [ ] Wallet sharing with other users
- [ ] Transaction analytics and reporting
- [ ] LLM-powered chat processing for transactions
- [ ] Receipt image processing with LLM
- [ ] Advanced Telegram bot features

## Technology Stack

- **Frontend**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Authentication**: Supabase Auth
- **UI Components**: Custom components with Tailwind CSS
- **Icons**: Lucide React
- **Date Handling**: date-fns

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd PersonalFinance
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   
   Fill in your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Set up the database:
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor
   - Run the SQL script from `database/schema.sql`

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Database Schema

The application uses a comprehensive database schema that includes:

- **Profiles**: User profile information
- **Wallets**: Multiple wallets with sharing capabilities
- **Categories**: Customizable transaction categories
- **Transactions**: Income, expense, and transfer records
- **Transaction Items**: Individual items within transactions
- **Budgets**: Period-based budget tracking
- **Loans**: Loan and credit management
- **Installments**: Payment scheduling for loans
- **Investments**: Investment portfolio tracking
- **Scheduled Transactions**: Recurring transaction automation

All tables implement Row Level Security (RLS) for data protection.

## Development Roadmap

### Phase 1: Core Financial Management ✅
- [x] Authentication system
- [x] Database schema design
- [x] Basic dashboard layout

### Phase 2: Transaction Management ✅
- [x] Wallet CRUD operations
- [x] Transaction creation and management
- [x] Category management
- [x] Multi-currency support

### Phase 3: Advanced Financial Features
- [ ] Budget creation and tracking
- [ ] Loan and installment management
- [ ] Investment portfolio tracking
- [ ] Scheduled transactions
- [ ] Transaction analytics and insights

### Phase 4: Automation & Integration
- [ ] Telegram bot integration
- [ ] LLM-powered transaction processing
- [ ] Receipt image processing
- [ ] Advanced analytics and insights

### Phase 5: Deployment & Scaling
- [ ] Railway.app deployment configuration
- [ ] Performance optimization
- [ ] Mobile app consideration

## API Routes

- `GET /auth/callback` - Supabase authentication callback
- `GET /api/wallets` - List user's wallets
- `POST /api/wallets` - Create a new wallet
- `GET /api/categories` - List user's categories
- `POST /api/categories` - Create a new category
- `GET /api/transactions` - List transactions (with optional wallet filter)
- `POST /api/transactions` - Create a new transaction
- `GET /api/budgets` - List user's budgets
- `POST /api/budgets` - Create a new budget
- `GET /api/investments` - List user's investments
- `POST /api/investments` - Create a new investment
- `POST /api/telegram/webhook` - Telegram bot webhook endpoint

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Optional |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Optional |
| `OPENAI_API_KEY` | OpenAI API key for LLM features | Optional |

## Deployment

### Railway.app (Recommended)
1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically on push to main branch

### Docker Deployment
1. Create a `.env` file with your environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

2. Build and run with Docker:
   ```bash
   # Linux/Mac
   ./scripts/docker-local.sh
   
   # Windows PowerShell
   ./scripts/docker-local.ps1
   ```

   Or manually:
   ```bash
   # Build with build arguments
   docker build \
     --build-arg NEXT_PUBLIC_SUPABASE_URL=your-supabase-url \
     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
     -t personal-finance .
     
   # Run with runtime environment variables
   docker run -p 3000:3000 --env-file .env personal-finance
   ```

### Other Platforms
The app can be deployed on any platform that supports Next.js:
- Vercel
- Netlify
- Heroku

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions and support, please open an issue in the GitHub repository.
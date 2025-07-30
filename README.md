# Personal Finance App

A comprehensive fullstack personal finance management application built with Next.js, Supabase, and Tailwind CSS.

## Features

### ✅ Implemented
- [x] User authentication with Supabase Auth
- [x] Responsive dashboard layout
- [x] Database schema for comprehensive finance tracking

### 🚧 In Development  
- [ ] Multiple wallets with sharing capabilities
- [ ] Expense and income tracking with categories
- [ ] Loan and credit/receivables management
- [ ] Installment payment tracking
- [ ] Investment tracking with current value monitoring
- [ ] Budgeting system with period-based tracking
- [ ] Scheduled/repeated transactions
- [ ] Item-level expense tracking for price monitoring
- [ ] Telegram bot integration
- [ ] LLM-powered chat processing for transactions
- [ ] Receipt image processing with LLM
- [ ] Railway.app deployment configuration

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

### Phase 2: Transaction Management (In Progress)
- [ ] Wallet CRUD operations
- [ ] Transaction creation and management
- [ ] Category management
- [ ] Basic reporting and analytics

### Phase 3: Advanced Features
- [ ] Budget creation and tracking
- [ ] Loan and installment management
- [ ] Investment portfolio tracking
- [ ] Scheduled transactions

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
- Future API routes will be documented here as they're implemented

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

### Other Platforms
The app can be deployed on any platform that supports Next.js:
- Vercel
- Netlify
- Heroku
- Docker containers

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions and support, please open an issue in the GitHub repository.
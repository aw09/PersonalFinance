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
- [x] Loan and credit/receivables management
- [x] Installment payment tracking
- [x] Advanced investment portfolio features
- [x] Scheduled/repeated transactions
- [x] Item-level expense tracking for price monitoring
- [x] Wallet sharing with other users
- [x] Transaction analytics and reporting
- [x] LLM-powered chat processing for transactions (structure ready)
- [x] Receipt image processing with LLM (structure ready)
- [x] Advanced Telegram bot features

### 🚧 In Development  
- [ ] Real-time financial insights dashboard
- [ ] Mobile app development
- [ ] Advanced portfolio optimization
- [ ] Tax reporting features
- [ ] Financial goal tracking and planning

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

### Phase 3: Advanced Financial Features ✅
- [x] Budget creation and tracking
- [x] Loan and installment management
- [x] Investment portfolio tracking
- [x] Scheduled transactions
- [x] Transaction analytics and insights

### Phase 4: Automation & Integration ✅
- [x] Enhanced Telegram bot integration
- [x] LLM-powered transaction processing (structure ready)
- [x] Receipt image processing (structure ready)
- [x] Advanced analytics and insights

### Phase 5: Deployment & Scaling
- [x] Railway.app deployment configuration
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
- `GET /api/investments/portfolio` - Get investment portfolio analytics
- `GET /api/loans` - List user's loans
- `POST /api/loans` - Create a new loan
- `GET /api/installments` - List installments for loans
- `POST /api/installments` - Create a new installment
- `PATCH /api/installments` - Update installment status
- `GET /api/scheduled-transactions` - List scheduled transactions
- `POST /api/scheduled-transactions` - Create a new scheduled transaction
- `PATCH /api/scheduled-transactions` - Update scheduled transaction
- `GET /api/transaction-items` - List items for a transaction
- `POST /api/transaction-items` - Add item to transaction
- `PUT /api/transaction-items` - Update transaction item
- `DELETE /api/transaction-items` - Delete transaction item
- `GET /api/wallet-shares` - List wallet shares
- `POST /api/wallet-shares` - Share wallet with user
- `PATCH /api/wallet-shares` - Update wallet share permissions
- `DELETE /api/wallet-shares` - Remove wallet share
- `GET /api/analytics` - Get financial analytics and insights
- `POST /api/llm` - Process natural language with AI (requires OpenAI API key)
- `POST /api/telegram/webhook` - Enhanced Telegram bot webhook endpoint

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
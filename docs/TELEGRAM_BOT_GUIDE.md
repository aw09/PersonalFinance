# Telegram Bot Integration Guide

## Overview

The Personal Finance Telegram Bot provides a complete interface for managing your financial data directly through Telegram. Users can perform all CRUD operations (Create, Read, Update, Delete) on wallets, transactions, budgets, categories, and investments.

## Features

### 🔗 Account Linking
- Secure linking between web account and Telegram
- Time-limited 6-digit codes (10 minutes expiry)
- One-time use tokens for security

### 💼 Wallet Management
- **List Wallets**: View all your wallets with balances
- **Create Wallet**: Full flow with name, description, and currency selection
- **View Wallet**: Detailed information with action buttons
- **Delete Wallet**: Safe deletion with transaction validation

### 💰 Transaction Management
- **List Transactions**: Recent transactions with full details
- **Add Transaction**: Comprehensive flow including:
  - Wallet selection from user's wallets
  - Transaction type (Income/Expense)
  - Amount with validation
  - Description
  - Smart category selection (filtered by transaction type)
  - Optional category assignment

### 🏷️ Category Management
- **List Categories**: Organized by type (Income/Expense)
- **Create Category**: Simple flow with type and name selection

### 📊 Budget & Investment Tracking
- **List Budgets**: View all budgets with details
- **List Investments**: View portfolio with P&L calculations

## Bot Commands

### Basic Commands
- `/start` or `/menu` - Show main menu
- `/help` - Display help information
- `/cancel` - Cancel current operation

### Navigation
- Use inline keyboard buttons for navigation
- Back buttons available in all submenus
- Cancel operations at any time

## Setup Instructions

### 1. Database Setup
Run the telegram extension SQL script:
```sql
-- Execute the contents of database/telegram_extension.sql
```

### 2. Environment Variables
Ensure these environment variables are set:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 3. Webhook Setup
Set up the webhook URL with your Telegram bot:
```
https://your-domain.com/api/telegram/webhook
```

## User Journey

### Account Linking
1. User visits web application and logs in
2. User generates a link token via the web interface
3. User starts conversation with Telegram bot (`/start`)
4. User clicks "Link Account" in the main menu
5. User sends the 6-digit token
6. Account is linked successfully

### Creating a Wallet
1. User selects "Wallets" from main menu
2. User clicks "Create Wallet"
3. User enters wallet name
4. User enters description (optional)
5. User selects currency (USD, EUR, GBP, JPY)
6. Wallet is created and ready to use

### Adding a Transaction
1. User selects "Transactions" from main menu
2. User clicks "Add Transaction"
3. User selects target wallet
4. User selects transaction type (Income/Expense)
5. User enters amount
6. User enters description
7. User optionally selects category (filtered by type)
8. Transaction is recorded

## API Endpoints

### `/api/telegram/webhook` (POST)
Main webhook handler for Telegram bot updates.

### `/api/telegram/link-token` (POST)
Generates account linking tokens for web users.
Requires authentication header.

## Architecture

### Core Libraries
- `telegramAuth.ts` - Authentication and session management
- `telegramCrud.ts` - Database operations for telegram users
- `telegramUI.ts` - UI components and message templates

### Security Features
- Row Level Security (RLS) enforced for all data access
- Service role key used for telegram operations
- Session-based conversation state management
- Token-based account linking with expiration

### Database Tables
- `profiles` - Extended with telegram fields
- `telegram_sessions` - Conversation state management
- `telegram_link_tokens` - Account linking tokens

## Error Handling

The bot includes comprehensive error handling:
- Invalid input validation
- Session timeout management
- Database constraint validation
- User-friendly error messages
- Automatic cleanup of expired data

## Testing

The bot can be tested by:
1. Setting up a test Telegram bot
2. Configuring webhook URL
3. Linking test accounts
4. Performing CRUD operations
5. Verifying data integrity

## Future Enhancements

Potential improvements:
- Complete edit operations for all entities
- Bulk operations and advanced filtering
- Natural language processing for transactions
- Rich reporting and analytics
- Export functionality
- Multi-language support
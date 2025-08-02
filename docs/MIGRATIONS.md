# Database Migrations Guide

This document explains how to use the Supabase migration system implemented in the Personal Finance application.

## Overview

The migration system provides:
- ✅ Version-controlled database schema changes
- ✅ Automated migration deployment
- ✅ Local development with Supabase CLI
- ✅ Production deployment support
- ✅ TypeScript type generation from schema
- ✅ Rollback capabilities through Supabase CLI

## Quick Start

### 1. Local Development Setup

```bash
# Start local Supabase instance
npm run db start

# This will start:
# - PostgreSQL database on port 54322
# - Supabase Studio on http://localhost:54323
# - API server on port 54321
```

### 2. View Database in Studio
Open http://localhost:54323 to view and manage your local database through Supabase Studio.

### 3. Reset Database (Apply All Migrations)
```bash
npm run db reset
```

## Migration Commands

### Using the Custom CLI Tool

```bash
# Show all available commands
npm run db help

# Start local development environment
npm run db start

# Stop local development environment  
npm run db stop

# Create a new migration
npm run db new add_user_preferences

# Apply pending migrations
npm run db up

# Check migration status
npm run db status

# Reset database and apply all migrations
npm run db reset

# Generate TypeScript types from current schema
npm run db types
```

### Using Supabase CLI Directly

```bash
# Create a new migration
npm run supabase:migration:new add_user_preferences

# Apply migrations
npm run supabase:migration:up

# Check migration status
npm run supabase:migration:status

# Reset database
npm run supabase:reset

# Generate types
npm run db:generate-types
```

## Creating Migrations

### 1. Create a New Migration File

```bash
npm run db new add_notifications_table
```

This creates a new SQL file in `supabase/migrations/` with a timestamp prefix.

### 2. Edit the Migration File

```sql
-- supabase/migrations/20250802_add_notifications_table.sql

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT CHECK (type IN ('info', 'warning', 'error', 'success')) DEFAULT 'info',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own notifications" ON notifications 
  FOR ALL USING (user_id = auth.uid());

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
```

### 3. Test the Migration Locally

```bash
# Apply the new migration
npm run db up

# Or reset to apply all migrations
npm run db reset
```

### 4. Generate Updated Types

```bash
npm run db types
```

## Production Deployment

### 1. Link to Production Project

```bash
npm run db link
# Follow prompts to enter your Supabase project reference ID
```

### 2. Deploy Migrations

```bash
npm run db push
```

This will:
- Apply all pending migrations to your production database
- Update your remote schema
- Maintain migration history

## Rollback Strategies

### Local Environment

```bash
# Reset to clean state and reapply all migrations
npm run db reset
```

### Production Environment

For production rollbacks, you have several options:

1. **Create a Rollback Migration** (Recommended)
```bash
npm run db new rollback_notifications_table
```

2. **Use Supabase Dashboard**
   - Go to your Supabase project dashboard
   - Use the SQL Editor to manually rollback changes
   - Create a migration file with the rollback SQL

3. **Database Backup Restore** (Last Resort)
   - Use Supabase's backup features
   - Restore from a previous backup point

## File Structure

```
supabase/
├── config.toml              # Supabase configuration
├── migrations/              # Migration files
│   └── 20250802102430_initial_schema.sql
├── seed.sql                # Default data (categories, etc.)
└── .gitignore              # Git ignore for temp files

src/lib/
├── supabase.ts             # Supabase client
└── migrations.ts           # Migration utilities

scripts/
└── db.js                   # Custom CLI tool
```

## Migration Best Practices

### 1. Migration Naming
Use descriptive names with underscores:
```bash
npm run db new add_user_preferences
npm run db new update_transaction_categories  
npm run db new fix_wallet_balance_trigger
```

### 2. Always Test Locally First
```bash
# Test your migration
npm run db reset

# Verify everything works
npm run dev
```

### 3. Include Rollback Information
Add comments in your migrations explaining how to rollback:

```sql
-- Migration: Add user preferences table
-- Rollback: DROP TABLE user_preferences;

CREATE TABLE user_preferences (
  -- table definition
);
```

### 4. Use Transactions for Complex Migrations
```sql
BEGIN;

-- Multiple related changes
ALTER TABLE users ADD COLUMN new_field TEXT;
UPDATE users SET new_field = 'default_value';
ALTER TABLE users ALTER COLUMN new_field SET NOT NULL;

COMMIT;
```

### 5. Backup Before Major Changes
Always create a backup before major schema changes in production.

## Troubleshooting

### Common Issues

1. **Migration Fails Locally**
```bash
# Check Supabase logs
npx supabase logs

# Reset and try again
npm run db reset
```

2. **TypeScript Errors After Schema Changes**
```bash
# Regenerate types
npm run db types

# Restart TypeScript server in your editor
```

3. **Production Deployment Issues**
```bash
# Check if properly linked
npx supabase projects list

# Re-link if needed
npm run db link
```

4. **Local Database Won't Start**
```bash
# Stop all Supabase processes
npm run db stop

# Start fresh
npm run db start
```

### Getting Help

- Check Supabase CLI documentation: https://supabase.com/docs/guides/cli
- Review migration files in `supabase/migrations/`
- Check Supabase Studio at http://localhost:54323 for local development
- View logs: `npx supabase logs`

## Environment Variables

Ensure you have the following environment variables set:

### Local Development (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key
```

### Production (.env.production)
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Next Steps

1. Set up CI/CD pipeline to automatically deploy migrations
2. Implement migration status monitoring
3. Add migration testing in CI
4. Consider implementing database backups before migrations
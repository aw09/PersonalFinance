-- Migration: Drop unused Telegram integration tables and functions
-- Date: 2025-09-05
-- NOTE: Backup your database before applying this migration.

DO $$
BEGIN
  -- Drop tables if they exist (use CASCADE to remove dependent objects / policies)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'telegram_transactions') THEN
    RAISE NOTICE 'Dropping table: telegram_transactions';
    DROP TABLE IF EXISTS public.telegram_transactions CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'telegram_commands') THEN
    RAISE NOTICE 'Dropping table: telegram_commands';
    DROP TABLE IF EXISTS public.telegram_commands CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'telegram_users') THEN
    RAISE NOTICE 'Dropping table: telegram_users';
    DROP TABLE IF EXISTS public.telegram_users CASCADE;
  END IF;

  -- Drop related functions if they exist
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_telegram_verification') THEN
    RAISE NOTICE 'Dropping function: create_telegram_verification(UUID)';
    DROP FUNCTION IF EXISTS create_telegram_verification(UUID) CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'verify_telegram_user') THEN
    RAISE NOTICE 'Dropping function: verify_telegram_user(BIGINT, TEXT)';
    DROP FUNCTION IF EXISTS verify_telegram_user(BIGINT, TEXT) CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_verification_code') THEN
    RAISE NOTICE 'Dropping function: generate_verification_code()';
    DROP FUNCTION IF EXISTS generate_verification_code() CASCADE;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- End migration

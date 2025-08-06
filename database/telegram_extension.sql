-- Telegram Bot Extension Schema
-- Add Telegram support to existing personal finance database

-- Add telegram fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;

-- Create telegram_sessions table for conversation state management
CREATE TABLE IF NOT EXISTS telegram_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_user_id BIGINT NOT NULL,
  telegram_chat_id BIGINT NOT NULL,
  session_data JSONB DEFAULT '{}',
  current_step TEXT,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast telegram user lookups
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_user_id ON profiles(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_user_id ON telegram_sessions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_expires ON telegram_sessions(expires_at);

-- Create account linking tokens table
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  telegram_user_id BIGINT,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_token ON telegram_link_tokens(token);
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires ON telegram_link_tokens(expires_at);

-- Add RLS policies for telegram tables
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own telegram sessions" ON telegram_sessions FOR ALL USING (
  telegram_user_id IN (SELECT telegram_user_id FROM profiles WHERE id = auth.uid())
);

ALTER TABLE telegram_link_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own link tokens" ON telegram_link_tokens FOR ALL USING (user_id = auth.uid());

-- Create cleanup function for expired sessions and tokens
CREATE OR REPLACE FUNCTION cleanup_expired_telegram_data()
RETURNS void AS $$
BEGIN
  DELETE FROM telegram_sessions WHERE expires_at < NOW();
  DELETE FROM telegram_link_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
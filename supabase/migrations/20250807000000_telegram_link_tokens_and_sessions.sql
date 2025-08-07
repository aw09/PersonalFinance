-- Migration to add telegram_link_tokens and telegram_sessions tables
-- Also add telegram fields to profiles table

-- Add telegram fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;

-- Create telegram_link_tokens table for secure account linking
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create telegram_sessions table for bot session management
CREATE TABLE IF NOT EXISTS telegram_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_user_id BIGINT NOT NULL,
  telegram_chat_id BIGINT NOT NULL,
  session_data JSONB DEFAULT '{}',
  current_step TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(telegram_user_id)
);

-- Enable RLS on new tables
ALTER TABLE telegram_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for telegram_link_tokens
CREATE POLICY "Users can view own link tokens" ON telegram_link_tokens 
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage own link tokens" ON telegram_link_tokens 
  FOR ALL USING (user_id = auth.uid());

-- RLS policies for telegram_sessions (service role access only)
-- Note: These sessions are managed by service role, so no user-level policies needed
-- The service role will bypass RLS anyway

-- Create function to cleanup expired telegram data
CREATE OR REPLACE FUNCTION cleanup_expired_telegram_data()
RETURNS VOID AS $$
BEGIN
  -- Delete expired link tokens
  DELETE FROM telegram_link_tokens 
  WHERE expires_at < NOW();
  
  -- Delete expired sessions
  DELETE FROM telegram_sessions 
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_token ON telegram_link_tokens(token);
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires_at ON telegram_link_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_telegram_user_id ON telegram_sessions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_expires_at ON telegram_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_user_id ON profiles(telegram_user_id);
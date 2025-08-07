-- Telegram Integration Migration

-- Create telegram_users table to link profiles with telegram users
CREATE TABLE IF NOT EXISTS telegram_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  verification_code TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create telegram_commands table to log command history
CREATE TABLE IF NOT EXISTS telegram_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_user_id UUID REFERENCES telegram_users(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  args TEXT,
  message TEXT NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create telegram_transactions for transactions created via Telegram
CREATE TABLE IF NOT EXISTS telegram_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_user_id UUID REFERENCES telegram_users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  amount DECIMAL(15,2),
  description TEXT,
  type TEXT CHECK (type IN ('income', 'expense', 'transfer')),
  status TEXT CHECK (status IN ('pending', 'processed', 'failed')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create a function to generate a random verification code
CREATE OR REPLACE FUNCTION generate_verification_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result TEXT := '';
  i INTEGER := 0;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars))::integer + 1, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on the new tables
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies for the new tables
CREATE POLICY "Users can view own telegram accounts" ON telegram_users 
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage own telegram accounts" ON telegram_users 
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can view own telegram commands" ON telegram_commands 
  FOR SELECT USING (
    telegram_user_id IN (SELECT id FROM telegram_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can view own telegram transactions" ON telegram_transactions 
  FOR SELECT USING (
    telegram_user_id IN (SELECT id FROM telegram_users WHERE user_id = auth.uid())
  );

-- Add necessary functions for Telegram integration

-- Function to associate a Telegram user with a profile using verification code
CREATE OR REPLACE FUNCTION verify_telegram_user(p_telegram_id BIGINT, p_verification_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Find the user_id for the given verification code
  SELECT user_id INTO v_user_id 
  FROM telegram_users 
  WHERE verification_code = p_verification_code AND verified = FALSE;
  
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Update the telegram user
  UPDATE telegram_users
  SET telegram_id = p_telegram_id, verified = TRUE
  WHERE user_id = v_user_id AND verification_code = p_verification_code;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a verification code for telegram linking
CREATE OR REPLACE FUNCTION create_telegram_verification(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
BEGIN
  -- Generate a unique verification code
  v_code := generate_verification_code();
  
  -- Create or update the telegram_users record
  INSERT INTO telegram_users (user_id, telegram_id, verification_code, verified)
  VALUES (p_user_id, 0, v_code, FALSE)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    verification_code = v_code,
    verified = FALSE,
    updated_at = NOW();
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

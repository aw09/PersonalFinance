-- LLM Usage Logging Migration
-- Create tables to track LLM API usage, prompts, and responses

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create llm_usage_logs table to track all LLM API calls
CREATE TABLE IF NOT EXISTS llm_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  telegram_user_id BIGINT, -- For telegram bot interactions
  provider TEXT NOT NULL DEFAULT 'gemini', -- gemini, openai, claude, etc.
  model TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
  prompt TEXT NOT NULL,
  response TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  cost_estimate DECIMAL(10,6), -- Estimated cost in USD
  response_time_ms INTEGER, -- Response time in milliseconds
  status TEXT CHECK (status IN ('success', 'error', 'rate_limited', 'timeout')) DEFAULT 'success',
  error_message TEXT,
  intent_detected TEXT, -- The detected intent from geminiAgent
  action_taken TEXT, -- The action that was performed based on the intent
  session_id TEXT, -- For tracking conversation sessions
  metadata JSONB, -- Additional metadata like API parameters, conversation context
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create llm_conversation_sessions table to track multi-turn conversations
CREATE TABLE IF NOT EXISTS llm_conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  telegram_user_id BIGINT,
  session_type TEXT CHECK (session_type IN ('telegram', 'web', 'api')) DEFAULT 'telegram',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  total_interactions INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  total_cost_estimate DECIMAL(10,6) DEFAULT 0,
  context JSONB -- Store conversation context and state
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_user_id ON llm_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_telegram_user_id ON llm_usage_logs(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_created_at ON llm_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_provider_model ON llm_usage_logs(provider, model);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_session_id ON llm_usage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_llm_conversation_sessions_user_id ON llm_conversation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_conversation_sessions_telegram_user_id ON llm_conversation_sessions(telegram_user_id);

-- Enable RLS on the new tables
ALTER TABLE llm_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_conversation_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for LLM usage logs
CREATE POLICY "Users can view own LLM usage logs" ON llm_usage_logs 
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert LLM usage logs" ON llm_usage_logs 
  FOR INSERT WITH CHECK (true); -- Allow system inserts for service role

CREATE POLICY "Users can view own LLM conversation sessions" ON llm_conversation_sessions 
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can manage LLM conversation sessions" ON llm_conversation_sessions 
  FOR ALL WITH CHECK (true); -- Allow system management for service role

-- Create function to update conversation session stats
CREATE OR REPLACE FUNCTION update_conversation_session_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Update session stats when new log is added
    UPDATE llm_conversation_sessions 
    SET 
      total_interactions = total_interactions + 1,
      total_tokens_used = total_tokens_used + COALESCE(NEW.total_tokens, 0),
      total_cost_estimate = total_cost_estimate + COALESCE(NEW.cost_estimate, 0)
    WHERE id::text = NEW.session_id;
    
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update conversation session stats
CREATE TRIGGER llm_usage_log_session_stats_trigger
  AFTER INSERT ON llm_usage_logs
  FOR EACH ROW 
  WHEN (NEW.session_id IS NOT NULL)
  EXECUTE FUNCTION update_conversation_session_stats();

-- Create function to estimate LLM costs (basic Gemini pricing)
CREATE OR REPLACE FUNCTION estimate_llm_cost(
  provider TEXT,
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER
)
RETURNS DECIMAL(10,6) AS $$
DECLARE
  input_cost_per_1k DECIMAL(10,6) := 0;
  output_cost_per_1k DECIMAL(10,6) := 0;
  total_cost DECIMAL(10,6) := 0;
BEGIN
  -- Gemini 2.0 Flash pricing (as of 2024)
  IF provider = 'gemini' AND model LIKE '%flash%' THEN
    input_cost_per_1k := 0.000075; -- $0.075 per 1M tokens = $0.000075 per 1K
    output_cost_per_1k := 0.0003;  -- $0.30 per 1M tokens = $0.0003 per 1K
  END IF;
  
  -- Calculate total cost
  total_cost := (prompt_tokens * input_cost_per_1k / 1000.0) + 
                (completion_tokens * output_cost_per_1k / 1000.0);
  
  RETURN total_cost;
END;
$$ LANGUAGE plpgsql;

-- Create view for LLM usage analytics
CREATE OR REPLACE VIEW llm_usage_analytics AS
SELECT 
  DATE_TRUNC('day', created_at) as date,
  provider,
  model,
  COUNT(*) as total_requests,
  SUM(total_tokens) as total_tokens_used,
  SUM(cost_estimate) as total_estimated_cost,
  AVG(response_time_ms) as avg_response_time_ms,
  COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_requests,
  COUNT(CASE WHEN status = 'error' THEN 1 END) as failed_requests,
  COUNT(CASE WHEN status = 'rate_limited' THEN 1 END) as rate_limited_requests
FROM llm_usage_logs
GROUP BY DATE_TRUNC('day', created_at), provider, model
ORDER BY date DESC;
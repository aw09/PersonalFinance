import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

export interface LLMUsageLogEntry {
  userId?: string
  telegramUserId?: number
  provider: string
  model: string
  prompt: string
  response: string | null
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costEstimate?: number
  responseTimeMs?: number
  status: 'success' | 'error' | 'rate_limited' | 'timeout'
  errorMessage?: string
  intentDetected?: string
  actionTaken?: string
  sessionId?: string
  metadata?: Record<string, any>
}

export interface ConversationSession {
  userId?: string
  telegramUserId?: number
  sessionType: 'telegram' | 'web' | 'api'
  context?: Record<string, any>
}

// Initialize Supabase client for service operations
function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !serviceKey) {
    console.warn('Supabase credentials not configured for LLM logging')
    return null
  }
  
  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Log LLM usage to database
export async function logLLMUsage(entry: LLMUsageLogEntry): Promise<void> {
  try {
    const supabase = getServiceSupabase()
    if (!supabase) {
      console.warn('LLM logging skipped: Supabase not configured')
      return
    }

    // Estimate cost if not provided
    let costEstimate = entry.costEstimate
    if (!costEstimate && entry.promptTokens && entry.completionTokens) {
      const { data: cost } = await supabase.rpc('estimate_llm_cost', {
        provider: entry.provider,
        model: entry.model,
        prompt_tokens: entry.promptTokens,
        completion_tokens: entry.completionTokens
      })
      costEstimate = cost || 0
    }

    const logData = {
      user_id: entry.userId,
      telegram_user_id: entry.telegramUserId,
      provider: entry.provider,
      model: entry.model,
      prompt: entry.prompt,
      response: entry.response,
      prompt_tokens: entry.promptTokens,
      completion_tokens: entry.completionTokens,
      total_tokens: entry.totalTokens,
      cost_estimate: costEstimate,
      response_time_ms: entry.responseTimeMs,
      status: entry.status,
      error_message: entry.errorMessage,
      intent_detected: entry.intentDetected,
      action_taken: entry.actionTaken,
      session_id: entry.sessionId,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null
    }

    const { error } = await supabase
      .from('llm_usage_logs')
      .insert(logData)

    if (error) {
      console.error('Failed to log LLM usage:', error)
    }
  } catch (err) {
    console.error('Error logging LLM usage:', err)
  }
}

// Create a new conversation session
export async function createConversationSession(session: ConversationSession): Promise<string | null> {
  try {
    const supabase = getServiceSupabase()
    if (!supabase) return null

    const sessionData = {
      user_id: session.userId,
      telegram_user_id: session.telegramUserId,
      session_type: session.sessionType,
      context: session.context ? JSON.stringify(session.context) : null
    }

    const { data, error } = await supabase
      .from('llm_conversation_sessions')
      .insert(sessionData)
      .select('id')
      .single()

    if (error) {
      console.error('Failed to create conversation session:', error)
      return null
    }

    return data?.id || null
  } catch (err) {
    console.error('Error creating conversation session:', err)
    return null
  }
}

// End a conversation session
export async function endConversationSession(sessionId: string): Promise<void> {
  try {
    const supabase = getServiceSupabase()
    if (!supabase) return

    const { error } = await supabase
      .from('llm_conversation_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)

    if (error) {
      console.error('Failed to end conversation session:', error)
    }
  } catch (err) {
    console.error('Error ending conversation session:', err)
  }
}

// Get LLM usage statistics for a user
export async function getLLMUsageStats(userId: string, days: number = 30) {
  try {
    const supabase = getServiceSupabase()
    if (!supabase) return null

    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)

    const { data, error } = await supabase
      .from('llm_usage_logs')
      .select(`
        provider,
        model,
        status,
        total_tokens,
        cost_estimate,
        created_at
      `)
      .eq('user_id', userId)
      .gte('created_at', fromDate.toISOString())

    if (error) {
      console.error('Failed to get LLM usage stats:', error)
      return null
    }

    // Calculate summary stats
    const stats = {
      totalRequests: data.length,
      successfulRequests: data.filter(d => d.status === 'success').length,
      totalTokens: data.reduce((sum, d) => sum + (d.total_tokens || 0), 0),
      totalCost: data.reduce((sum, d) => sum + (d.cost_estimate || 0), 0),
      providers: {} as Record<string, number>,
      models: {} as Record<string, number>
    }

    // Count by provider and model
    data.forEach(d => {
      stats.providers[d.provider] = (stats.providers[d.provider] || 0) + 1
      stats.models[d.model] = (stats.models[d.model] || 0) + 1
    })

    return stats
  } catch (err) {
    console.error('Error getting LLM usage stats:', err)
    return null
  }
}
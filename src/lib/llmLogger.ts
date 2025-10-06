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
  status?: 'success' | 'error' | 'rate_limited' | 'timeout'
  errorMessage?: string
  intentDetected?: string
  actionTaken?: string
  sessionId?: string
  metadata?: Record<string, any>
  tokens?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  cost?: number
  error?: string
}

export interface ConversationSession {
  userId?: string
  telegramUserId?: number
  sessionType: 'telegram' | 'web' | 'api'
  context?: Record<string, any>
}

let serviceSupabaseClient: ReturnType<typeof createClient<Database>> | null = null

function sanitizeJson<T extends Record<string, any> | null | undefined>(value: T): Record<string, any> | null {
  if (!value) return null

  try {
    return JSON.parse(JSON.stringify(value, (_key, val) => {
      if (typeof val === 'bigint') {
        return Number(val)
      }
      return val
    }))
  } catch (error) {
    console.warn('Failed to sanitise JSON payload for LLM logging. Falling back to null.', error)
    return null
  }
}

// Initialize Supabase client for service operations
function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !serviceKey) {
    console.warn('Supabase credentials not configured for LLM logging')
    return null
  }

  if (serviceSupabaseClient) {
    return serviceSupabaseClient
  }
  
  serviceSupabaseClient = createClient<Database>(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  return serviceSupabaseClient
}

export function __resetLLMLoggerForTests() {
  serviceSupabaseClient = null
}

// Log LLM usage to database
export async function logLLMUsage(entry: LLMUsageLogEntry): Promise<boolean> {
  try {
    const supabase = getServiceSupabase()
    if (!supabase) {
      console.warn('LLM logging skipped: Supabase not configured')
      return false
    }

    // Estimate cost if not provided
    const effectivePromptTokens = entry.promptTokens ?? entry.tokens?.promptTokens
    const effectiveCompletionTokens = entry.completionTokens ?? entry.tokens?.completionTokens
    const effectiveTotalTokens = entry.totalTokens ?? entry.tokens?.totalTokens ?? (
      effectivePromptTokens !== undefined && effectiveCompletionTokens !== undefined
        ? effectivePromptTokens + effectiveCompletionTokens
        : undefined
    )

    let costEstimate = entry.costEstimate ?? entry.cost
    if (costEstimate === undefined && typeof effectivePromptTokens === 'number' && typeof effectiveCompletionTokens === 'number') {
      const { data: cost, error: costError } = await supabase.rpc('estimate_llm_cost', {
        provider: entry.provider || 'gemini',
        model: entry.model || 'gemini-2.0-flash',
        prompt_tokens: effectivePromptTokens,
        completion_tokens: effectiveCompletionTokens
      })

      if (costError) {
        console.warn('Failed to estimate LLM cost via RPC:', costError)
      } else {
        costEstimate = cost ?? 0
      }
    }

    const safeMetadata = sanitizeJson(entry.metadata)

    const logData = {
      user_id: entry.userId,
      telegram_user_id: entry.telegramUserId,
      provider: entry.provider || 'gemini',
      model: entry.model || 'gemini-2.0-flash',
      prompt: entry.prompt,
      response: entry.response,
      prompt_tokens: effectivePromptTokens,
      completion_tokens: effectiveCompletionTokens,
      total_tokens: effectiveTotalTokens,
      cost_estimate: costEstimate,
      response_time_ms: entry.responseTimeMs,
      status: entry.status || (entry.errorMessage || entry.error ? 'error' : 'success'),
      error_message: entry.errorMessage ?? entry.error,
      intent_detected: entry.intentDetected,
      action_taken: entry.actionTaken,
      session_id: entry.sessionId,
      metadata: safeMetadata
    }

    const { error } = await supabase.from('llm_usage_logs').insert(logData)

    if (error) {
      console.error('Failed to log LLM usage:', {
        error,
        provider: logData.provider,
        model: logData.model,
        status: logData.status,
        sessionId: logData.session_id,
        promptLength: logData.prompt?.length,
        responseLength: logData.response?.length
      })
      return false
    }
    return true
  } catch (err) {
    console.error('Error logging LLM usage:', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      error: err
    })
    return false
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
      context: sanitizeJson(session.context)
    }

    const { data, error } = await supabase
      .from('llm_conversation_sessions')
      .insert(sessionData)
      .select('id')
      .single()

    if (error) {
      console.error('Failed to create conversation session:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return null
    }

    return data?.id || null
  } catch (err) {
    console.error('Error creating conversation session:', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      error: err
    })
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
      console.error('Failed to end conversation session:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
    }
  } catch (err) {
    console.error('Error ending conversation session:', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      error: err
    })
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
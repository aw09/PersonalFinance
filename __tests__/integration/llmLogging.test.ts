// Integration tests for LLM Logging with database assertions
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { createClient } from '@supabase/supabase-js'
import { logLLMUsage } from '../../src/lib/llmLogger'
import { v4 as uuidv4 } from 'uuid'

describe('LLM Logging Integration', () => {
  let supabase: any
  let testUserId: string
  let testSessionIds: string[]

  beforeEach(async () => {
    supabase = global.testUtils.createTestSupabaseClient()
    testUserId = global.testUtils.generateTestUserId()
    testSessionIds = []

    // Create a test user profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: testUserId,
        email: `test-${testUserId}@example.com`,
        created_at: new Date().toISOString()
      })

    if (profileError) {
      console.warn('Profile creation error (might already exist):', profileError.message)
    }
  })

  afterEach(async () => {
    // Clean up test data
    if (testSessionIds.length > 0) {
      await supabase
        .from('llm_usage_logs')
        .delete()
        .in('session_id', testSessionIds)
    }

    await supabase
      .from('profiles')
      .delete()
      .eq('id', testUserId)
  })

  describe('LLM Usage Logging', () => {
    it('should log LLM usage with sessionId and token fields', async () => {
      const sessionId = uuidv4()
      testSessionIds.push(sessionId)

      const logEntry = {
        userId: testUserId,
        telegramUserId: global.testUtils.generateTestTelegramUserId(),
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        prompt: 'Test prompt for logging',
        response: 'Test response from AI',
        status: 'success',
        sessionId,
        tokens: {
          promptTokens: 50,
          completionTokens: 75,
          totalTokens: 125
        },
        cost: 0.001,
        responseTimeMs: 1500,
        metadata: {
          toolsUsed: ['test_tool'],
          confidenceScore: 85,
          processingSteps: ['security_check', 'tool_selection', 'response_generation']
        }
      }

      await logLLMUsage(logEntry)

      // Verify the log was created with all required fields
      const { data: loggedEntries, error } = await supabase
        .from('llm_usage_logs')
        .select('*')
        .eq('session_id', sessionId)

      expect(error).toBeNull()
      expect(loggedEntries).toHaveLength(1)

      const loggedEntry = loggedEntries[0]
      
      // Assert core fields
      expect(loggedEntry.user_id).toBe(testUserId)
      expect(loggedEntry.telegram_user_id).toBe(logEntry.telegramUserId)
      expect(loggedEntry.session_id).toBe(sessionId)
      expect(loggedEntry.provider).toBe('gemini')
      expect(loggedEntry.model).toBe('gemini-2.0-flash')
      expect(loggedEntry.prompt).toBe('Test prompt for logging')
      expect(loggedEntry.response).toBe('Test response from AI')
      expect(loggedEntry.status).toBe('success')

      // Assert token fields are present and correct
      expect(loggedEntry.prompt_tokens).toBe(50)
      expect(loggedEntry.completion_tokens).toBe(75)
      expect(loggedEntry.total_tokens).toBe(125)

      // Assert other important fields
      expect(loggedEntry.cost).toBe(0.001)
      expect(loggedEntry.response_time_ms).toBe(1500)
      
      // Assert metadata is stored correctly
      expect(loggedEntry.metadata).toMatchObject({
        toolsUsed: ['test_tool'],
        confidenceScore: 85,
        processingSteps: ['security_check', 'tool_selection', 'response_generation']
      })

      // Assert timestamps
      expect(loggedEntry.created_at).toBeDefined()
      expect(new Date(loggedEntry.created_at)).toBeInstanceOf(Date)

      // Assert UUID fields are valid UUIDs
      expect(loggedEntry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      expect(loggedEntry.session_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    it('should handle minimal log entries', async () => {
      const sessionId = uuidv4()
      testSessionIds.push(sessionId)

      const minimalLogEntry = {
        userId: testUserId,
        prompt: 'Minimal test prompt',
        response: 'Minimal test response',
        sessionId
      }

      await logLLMUsage(minimalLogEntry)

      const { data: loggedEntries, error } = await supabase
        .from('llm_usage_logs')
        .select('*')
        .eq('session_id', sessionId)

      expect(error).toBeNull()
      expect(loggedEntries).toHaveLength(1)

      const loggedEntry = loggedEntries[0]
      expect(loggedEntry.user_id).toBe(testUserId)
      expect(loggedEntry.session_id).toBe(sessionId)
      expect(loggedEntry.prompt).toBe('Minimal test prompt')
      expect(loggedEntry.response).toBe('Minimal test response')
      
      // Fields should have defaults or be null
      expect(loggedEntry.provider).toBe('gemini') // Default
      expect(loggedEntry.model).toBe('gemini-2.0-flash') // Default
      expect(loggedEntry.status).toBe('success') // Default
    })

    it('should log error cases with proper status', async () => {
      const sessionId = uuidv4()
      testSessionIds.push(sessionId)

      const errorLogEntry = {
        userId: testUserId,
        sessionId,
        prompt: 'Error test prompt',
        response: '',
        status: 'error',
        error: 'API timeout error',
        responseTimeMs: 30000,
        metadata: {
          errorType: 'timeout',
          retryAttempts: 3
        }
      }

      await logLLMUsage(errorLogEntry)

      const { data: loggedEntries, error } = await supabase
        .from('llm_usage_logs')
        .select('*')
        .eq('session_id', sessionId)

      expect(error).toBeNull()
      expect(loggedEntries).toHaveLength(1)

      const loggedEntry = loggedEntries[0]
      expect(loggedEntry.status).toBe('error')
      expect(loggedEntry.error).toBe('API timeout error')
      expect(loggedEntry.response_time_ms).toBe(30000)
      expect(loggedEntry.metadata).toMatchObject({
        errorType: 'timeout',
        retryAttempts: 3
      })
    })

    it('should support conversation sessions with multiple entries', async () => {
      const sessionId = uuidv4()
      testSessionIds.push(sessionId)

      // Log multiple entries in the same session
      const entries = [
        {
          userId: testUserId,
          sessionId,
          prompt: 'First message in conversation',
          response: 'First response',
          tokens: { promptTokens: 10, completionTokens: 15, totalTokens: 25 }
        },
        {
          userId: testUserId,
          sessionId,
          prompt: 'Second message in conversation',
          response: 'Second response',
          tokens: { promptTokens: 12, completionTokens: 18, totalTokens: 30 }
        },
        {
          userId: testUserId,
          sessionId,
          prompt: 'Third message in conversation',
          response: 'Third response',
          tokens: { promptTokens: 8, completionTokens: 12, totalTokens: 20 }
        }
      ]

      for (const entry of entries) {
        await logLLMUsage(entry)
        // Small delay to ensure different timestamps
        await global.testUtils.waitFor(10)
      }

      const { data: sessionEntries, error } = await supabase
        .from('llm_usage_logs')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      expect(error).toBeNull()
      expect(sessionEntries).toHaveLength(3)

      // Verify session continuity
      sessionEntries.forEach((entry, index) => {
        expect(entry.session_id).toBe(sessionId)
        expect(entry.user_id).toBe(testUserId)
        expect(entry.prompt).toBe(entries[index].prompt)
        expect(entry.response).toBe(entries[index].response)
        expect(entry.total_tokens).toBe(entries[index].tokens.totalTokens)
      })

      // Verify timestamps are in order
      for (let i = 1; i < sessionEntries.length; i++) {
        expect(new Date(sessionEntries[i].created_at).getTime())
          .toBeGreaterThan(new Date(sessionEntries[i - 1].created_at).getTime())
      }
    })

    it('should aggregate token usage correctly', async () => {
      const sessionId = uuidv4()
      testSessionIds.push(sessionId)

      const tokenEntries = [
        { promptTokens: 100, completionTokens: 150, totalTokens: 250 },
        { promptTokens: 75, completionTokens: 125, totalTokens: 200 },
        { promptTokens: 50, completionTokens: 75, totalTokens: 125 }
      ]

      for (const [index, tokens] of tokenEntries.entries()) {
        await logLLMUsage({
          userId: testUserId,
          sessionId,
          prompt: `Test prompt ${index + 1}`,
          response: `Test response ${index + 1}`,
          tokens
        })
      }

      // Query aggregated token usage for the session
      const { data: aggregation, error } = await supabase
        .from('llm_usage_logs')
        .select('prompt_tokens, completion_tokens, total_tokens')
        .eq('session_id', sessionId)

      expect(error).toBeNull()

      const totalPromptTokens = aggregation.reduce((sum, entry) => sum + (entry.prompt_tokens || 0), 0)
      const totalCompletionTokens = aggregation.reduce((sum, entry) => sum + (entry.completion_tokens || 0), 0)
      const totalTokensSum = aggregation.reduce((sum, entry) => sum + (entry.total_tokens || 0), 0)

      expect(totalPromptTokens).toBe(225) // 100 + 75 + 50
      expect(totalCompletionTokens).toBe(350) // 150 + 125 + 75
      expect(totalTokensSum).toBe(575) // 250 + 200 + 125
    })
  })

  describe('Database Constraints and Validation', () => {
    it('should enforce required fields', async () => {
      // Try to log without required user_id
      try {
        await logLLMUsage({
          prompt: 'Test without user ID',
          response: 'Should fail'
        } as any)
        
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error.message || error).toContain('user_id')
      }
    })

    it('should handle foreign key constraints', async () => {
      const fakeUserId = uuidv4()
      
      // This should handle the foreign key constraint gracefully
      try {
        await logLLMUsage({
          userId: fakeUserId,
          prompt: 'Test with fake user ID',
          response: 'Should handle FK constraint'
        })
        
        // Should not reach here if FK constraint is enforced
        expect(true).toBe(false)
      } catch (error) {
        // Expected to fail due to foreign key constraint
        expect(error.message).toBeDefined()
      }
    })

    it('should validate token field types', async () => {
      const sessionId = uuidv4()
      testSessionIds.push(sessionId)

      await logLLMUsage({
        userId: testUserId,
        sessionId,
        prompt: 'Token validation test',
        response: 'Testing token types',
        tokens: {
          promptTokens: 100,
          completionTokens: 150,
          totalTokens: 250
        }
      })

      const { data: entry, error } = await supabase
        .from('llm_usage_logs')
        .select('prompt_tokens, completion_tokens, total_tokens')
        .eq('session_id', sessionId)
        .single()

      expect(error).toBeNull()
      expect(typeof entry.prompt_tokens).toBe('number')
      expect(typeof entry.completion_tokens).toBe('number')
      expect(typeof entry.total_tokens).toBe('number')
      expect(entry.prompt_tokens).toBe(100)
      expect(entry.completion_tokens).toBe(150)
      expect(entry.total_tokens).toBe(250)
    })
  })
})
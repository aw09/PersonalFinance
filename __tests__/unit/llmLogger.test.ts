// @ts-nocheck

import { logLLMUsage, __resetLLMLoggerForTests } from '../../src/lib/llmLogger'

const insertMock = jest.fn()
const fromMock = jest.fn(() => ({ insert: insertMock }))
const rpcMock = jest.fn()
const createClientMock = jest.fn(() => ({
  from: fromMock,
  rpc: rpcMock,
  auth: { autoRefreshToken: false, persistSession: false }
}))

jest.mock('@supabase/supabase-js', () => ({
  __esModule: true,
  createClient: (...args: any[]) => createClientMock(...args)
}))

describe('logLLMUsage', () => {
  const originalEnv = { ...process.env }
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    rpcMock.mockResolvedValue({ data: 0.0025, error: null })
    insertMock.mockResolvedValue({ data: null, error: null })
    __resetLLMLoggerForTests()
  })

  afterEach(() => {
    __resetLLMLoggerForTests()
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    Object.assign(process.env, originalEnv)
  })

  it('persists LLM usage details successfully', async () => {
    const result = await logLLMUsage({
      userId: 'user-123',
      telegramUserId: 42,
      provider: 'gemini',
      model: 'flash',
      prompt: 'What is my balance?',
      response: 'Your current balance is $123.45.',
      promptTokens: 80,
      completionTokens: 32,
      totalTokens: 112,
      status: 'success',
      responseTimeMs: 1500,
      metadata: { toolsUsed: ['get_wallets'], confidenceScore: 0.92 }
    })

    expect(result).toBe(true)
    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(fromMock).toHaveBeenCalledWith('llm_usage_logs')
    expect(insertMock).toHaveBeenCalledTimes(1)

    const payload = insertMock.mock.calls[0][0]
    expect(payload.user_id).toBe('user-123')
    expect(payload.telegram_user_id).toBe(42)
    expect(payload.prompt_tokens).toBe(80)
    expect(payload.completion_tokens).toBe(32)
    expect(payload.total_tokens).toBe(112)
    expect(payload.cost_estimate).toBe(0.0025)
    expect(payload.metadata).toEqual({ toolsUsed: ['get_wallets'], confidenceScore: 0.92 })
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('supports legacy token fields via tokens object', async () => {
    rpcMock.mockClear()
    insertMock.mockResolvedValue({ data: null, error: null })

    const result = await logLLMUsage({
      provider: 'gemini',
      model: 'flash',
      prompt: 'hello',
      response: 'world',
      status: 'success',
      tokens: {
        promptTokens: 20,
        completionTokens: 10,
        totalTokens: 30
      }
    })

    expect(result).toBe(true)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    const payload = insertMock.mock.calls[0][0]
    expect(payload.prompt_tokens).toBe(20)
    expect(payload.completion_tokens).toBe(10)
    expect(payload.total_tokens).toBe(30)
  })

  it('skips cost estimation when token data is incomplete', async () => {
    rpcMock.mockClear()
    insertMock.mockResolvedValue({ data: null, error: null })

    const result = await logLLMUsage({
      provider: 'gemini',
      model: 'flash',
      prompt: 'hi',
      response: 'there',
      status: 'success',
      tokens: {
        promptTokens: 18
      }
    })

    expect(result).toBe(true)
    expect(rpcMock).not.toHaveBeenCalled()
    const payload = insertMock.mock.calls[0][0]
    expect(payload.prompt_tokens).toBe(18)
    expect(payload.completion_tokens).toBeUndefined()
    expect(payload.cost_estimate).toBeUndefined()
  })

  it('returns false and logs when Supabase insert fails', async () => {
    insertMock.mockResolvedValue({
      data: null,
      error: { message: 'insert failed', code: '400', details: 'bad data' }
    })

    const result = await logLLMUsage({
      provider: 'gemini',
      model: 'flash',
      prompt: 'ping',
      response: 'pong',
      status: 'error',
      errorMessage: 'LLM unavailable'
    })

    expect(result).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})

// Mock Supabase client for testing
export const createMockSupabaseClient = () => {
  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
  }

  const mockSupabase = {
    from: jest.fn().mockReturnValue(mockQueryBuilder),
    auth: {
      getUser: jest.fn(),
      getSession: jest.fn(),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
    storage: {
      from: jest.fn().mockReturnValue({
        upload: jest.fn(),
        download: jest.fn(),
        remove: jest.fn(),
        list: jest.fn(),
        getPublicUrl: jest.fn(),
      }),
    },
    rpc: jest.fn(),
  }

  return mockSupabase
}

export const mockSupabaseResponse = {
  success: (data: any) => Promise.resolve({ data, error: null }),
  error: (error: any) => Promise.resolve({ data: null, error }),
}

export const createMockLLMLogEntry = (overrides: any = {}) => ({
  id: 'test-log-id',
  user_id: 'test-user-id',
  session_id: 'test-session-id',
  telegram_user_id: 123456789,
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  prompt: 'Test prompt',
  response: 'Test response',
  status: 'success',
  prompt_tokens: 50,
  completion_tokens: 75,
  total_tokens: 125,
  cost: 0.001,
  response_time_ms: 1500,
  created_at: new Date().toISOString(),
  metadata: {},
  ...overrides,
})
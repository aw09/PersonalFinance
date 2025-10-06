// Integration test setup
import { createClient } from '@supabase/supabase-js'

// Load test environment variables
require('dotenv').config({ path: '.env.test' })

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// Global test utilities
global.testUtils = {
  // Create a test Supabase client
  createTestSupabaseClient: () => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'
    )
  },

  // Generate test user ID
  generateTestUserId: () => {
    return `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`
  },

  // Generate test telegram user ID
  generateTestTelegramUserId: () => {
    return Math.floor(Math.random() * 1000000000)
  },

  // Wait for a promise to resolve
  waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Mock fetch response
  mockFetchResponse: (data, status = 200) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
    }
  },
}

// Set up test timeout
jest.setTimeout(30000)
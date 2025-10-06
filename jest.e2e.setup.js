// E2E test setup
require('dotenv').config({ path: '.env.test' })

// Global E2E test utilities
global.e2eUtils = {
  // Test configuration
  config: {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key',
    geminiApiKey: process.env.GEMINI_API_KEY || 'test-gemini-key',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token',
  },

  // Create test data
  createTestUser: async () => {
    const userId = `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`
    const telegramUserId = Math.floor(Math.random() * 1000000000)
    
    return {
      id: userId,
      telegramUserId,
      email: `test-${userId}@example.com`,
    }
  },

  // Clean up test data
  cleanupTestData: async (testData) => {
    // Implementation for cleaning up test data
    console.log('Cleaning up test data:', testData)
  },

  // Simulate user interactions
  simulateUserQuery: async (query, userId, telegramUserId) => {
    // This will be implemented to test the actual agent system
    return {
      query,
      userId,
      telegramUserId,
      timestamp: new Date().toISOString(),
    }
  },
}

// Set up longer timeout for E2E tests
jest.setTimeout(60000)
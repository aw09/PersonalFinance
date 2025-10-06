// E2E tests for user behavior - ensuring no "Sorry, I could not generate a reply right now" responses
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { handleAdvancedTelegramQuery } from '../../src/lib/geminiAgentV3'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

// Mock the Gemini API to provide realistic responses
jest.mock('../../src/lib/gemini', () => ({
  generateGeminiReply: jest.fn().mockImplementation(async (prompt, options) => {
    const { intent } = options || {}
    
    // Simulate different types of responses based on intent
    switch (intent) {
      case 'security_analysis':
        return {
          text: JSON.stringify({
            isSafe: true,
            threatLevel: 'none',
            reasoning: 'Legitimate financial query',
            suspiciousElements: []
          })
        }
      
      case 'query_analysis':
        return {
          text: JSON.stringify({
            complexity: 'simple',
            primaryIntent: 'General financial advice',
            requiredData: ['general_knowledge'],
            suggestedTools: [],
            isMultiStep: false,
            needsContext: false,
            estimatedTools: 0
          })
        }
      
      case 'tool_selection':
        return {
          text: JSON.stringify({
            selectedTools: [],
            reasoning: 'General question that can be answered without tools',
            confidence: 0.8
          })
        }
      
      case 'general_conversation':
        if (prompt.includes('What can you do')) {
          return {
            text: `I'm your personal finance assistant! I can help you with:

🏦 **Financial Management:**
- Track expenses and income
- Create and manage budgets
- Organize multiple wallets
- Categorize transactions

💡 **Financial Advice:**
- Budgeting strategies and tips
- Saving and investment guidance
- Debt management advice
- Financial planning insights

🤖 **Smart Features:**
- Process receipt images automatically
- Provide personalized recommendations
- Answer financial questions
- Help you make informed decisions

Try asking me things like:
- "How should I budget my money?"
- "What are good saving strategies?"
- "Add a $50 expense for groceries"
- "Show me my recent transactions"

I'm here to help you achieve your financial goals!`
          }
        }
        
        if (prompt.includes('Create wallet') || prompt.includes('create wallet')) {
          return {
            text: `I'd be happy to help you create a new wallet! 

To create a wallet, I'll need some information:

💳 **Wallet Setup:**
- **Name**: What would you like to call this wallet? (e.g., "Main Account", "Savings", "Credit Card")
- **Currency**: What currency will you use? (USD, EUR, GBP, etc.)
- **Initial Balance**: What's the starting balance? (optional)

You can tell me something like:
- "Create a wallet called 'Savings Account' with USD currency"
- "Make a new EUR wallet for my vacation fund"
- "Set up a credit card wallet with $0 balance"

Just let me know these details and I'll create your wallet right away!`
          }
        }
        
        if (prompt.includes('budget') && (prompt.includes('how') || prompt.includes('should'))) {
          return {
            text: `Great question! Here are some effective budgeting strategies:

📊 **The 50/30/20 Rule:**
- 50% for needs (rent, utilities, groceries)
- 30% for wants (entertainment, dining out)
- 20% for savings and debt payment

💡 **Budgeting Tips:**
- Track every expense for at least one month
- Use categories to identify spending patterns
- Set realistic goals and adjust as needed
- Automate savings to pay yourself first

🎯 **Getting Started:**
1. Calculate your after-tax income
2. List all your fixed expenses
3. Track variable expenses for patterns
4. Set aside money for emergencies
5. Allocate remaining funds to goals

I can help you create specific budgets for different categories. Just say something like "Create a monthly grocery budget for $400" and I'll set it up for you!

Would you like me to help you create a budget for a specific category?`
          }
        }
        
        if (prompt.includes('save money') || prompt.includes('saving')) {
          return {
            text: `Here are proven strategies to save more money:

💰 **Immediate Savings:**
- Track all expenses to find spending leaks
- Cancel unused subscriptions
- Cook more meals at home
- Use the 24-hour rule for non-essential purchases

🏦 **Automated Savings:**
- Set up automatic transfers to savings
- Use high-yield savings accounts
- Save your tax refund and bonuses
- Round up purchases to save spare change

📈 **Long-term Strategies:**
- Build an emergency fund (3-6 months expenses)
- Take advantage of employer 401k matching
- Pay off high-interest debt first
- Consider investing in index funds

🎯 **Smart Shopping:**
- Compare prices before major purchases
- Use cashback apps and credit cards responsibly
- Buy generic brands for basic items
- Plan meals and make shopping lists

Start with one or two strategies and build from there. Small changes can lead to big savings over time!

Would you like help setting up a specific savings goal or budget?`
          }
        }
        
        return {
          text: `I understand you're asking about personal finance, and I'm here to help! 

Based on your question, I can provide personalized advice and assistance. Whether you're looking to:

- Budget more effectively
- Save money and build wealth  
- Track expenses and income
- Make informed financial decisions
- Plan for future goals

I have access to financial knowledge and can help you with both general advice and specific actions like creating budgets, tracking transactions, and managing your wallets.

Could you tell me more specifically what you'd like help with? I'm designed to provide helpful, actionable financial guidance tailored to your situation.`
        }
      
      default:
        return {
          text: `I'm here to help with your personal finance questions! Could you please rephrase your question so I can provide you with the best guidance?`
        }
    }
  })
}))

describe('User Behavior E2E Tests', () => {
  let supabase: any
  let testUser: any
  let testTelegramUserId: number

  beforeEach(async () => {
    supabase = global.e2eUtils.createTestSupabaseClient()
    testUser = await global.e2eUtils.createTestUser()
    testTelegramUserId = testUser.telegramUserId

    // Create test user in database
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: testUser.id,
        email: testUser.email,
        created_at: new Date().toISOString()
      })

    if (profileError) {
      console.warn('Profile creation error (might already exist):', profileError.message)
    }

    // Create telegram user linkage
    const { error: telegramError } = await supabase
      .from('telegram_users')
      .insert({
        telegram_user_id: testTelegramUserId,
        user_id: testUser.id,
        username: `test_user_${testTelegramUserId}`,
        first_name: 'Test',
        last_name: 'User',
        created_at: new Date().toISOString()
      })

    if (telegramError) {
      console.warn('Telegram user creation error (might already exist):', telegramError.message)
    }
  })

  afterEach(async () => {
    // Clean up test data
    await supabase.from('telegram_users').delete().eq('telegram_user_id', testTelegramUserId)
    await supabase.from('profiles').delete().eq('id', testUser.id)
  })

  describe('Common User Queries', () => {
    it('should handle "What can you do?" without error messages', async () => {
      const response = await handleAdvancedTelegramQuery(
        testTelegramUserId,
        123456789,
        'What can you do?'
      )

      expect(response).toBeDefined()
      expect(response).not.toContain('Sorry, I could not generate a reply right now')
      expect(response).not.toContain('I apologize, but I encountered an error')
      expect(response).not.toContain('Please try again')
      
      // Should contain helpful information about capabilities
      expect(response).toContain('personal finance assistant')
      expect(response).toContain('help')
      expect(response.length).toBeGreaterThan(100) // Substantial response
    })

    it('should handle "Create wallet" instruction without error messages', async () => {
      const response = await handleAdvancedTelegramQuery(
        testTelegramUserId,
        123456789,
        'Create wallet'
      )

      expect(response).toBeDefined()
      expect(response).not.toContain('Sorry, I could not generate a reply right now')
      expect(response).not.toContain('I apologize, but I encountered an error')
      expect(response).not.toContain('Please try again')
      
      // Should provide guidance on wallet creation
      expect(response).toContain('wallet')
      expect(response).toContain('create')
      expect(response.length).toBeGreaterThan(50)
    })

    it('should handle general budgeting questions without error messages', async () => {
      const budgetingQuestions = [
        'How should I budget my money?',
        'What is the best way to budget?',
        'Can you help me with budgeting?',
        'How do I create a budget?',
        'What are good budgeting strategies?'
      ]

      for (const question of budgetingQuestions) {
        const response = await handleAdvancedTelegramQuery(
          testTelegramUserId,
          123456789,
          question
        )

        expect(response).toBeDefined()
        expect(response).not.toContain('Sorry, I could not generate a reply right now')
        expect(response).not.toContain('I apologize, but I encountered an error')
        expect(response).not.toContain('Please try again')
        
        // Should contain budgeting advice
        expect(response).toContain('budget')
        expect(response.length).toBeGreaterThan(100)
      }
    })

    it('should handle saving money questions without error messages', async () => {
      const savingQuestions = [
        'How can I save money?',
        'What are good saving strategies?',
        'Help me save more money',
        'How do I build savings?',
        'What is the best way to save?'
      ]

      for (const question of savingQuestions) {
        const response = await handleAdvancedTelegramQuery(
          testTelegramUserId,
          123456789,
          question
        )

        expect(response).toBeDefined()
        expect(response).not.toContain('Sorry, I could not generate a reply right now')
        expect(response).not.toContain('I apologize, but I encountered an error')
        expect(response).not.toContain('Please try again')
        
        // Should contain saving advice
        expect(response).toContain('sav')
        expect(response.length).toBeGreaterThan(100)
      }
    })

    it('should handle investment questions without error messages', async () => {
      const investmentQuestions = [
        'How should I invest?',
        'What are good investment strategies?',
        'Should I invest in stocks?',
        'How do I start investing?',
        'What is compound interest?'
      ]

      for (const question of investmentQuestions) {
        const response = await handleAdvancedTelegramQuery(
          testTelegramUserId,
          123456789,
          question
        )

        expect(response).toBeDefined()
        expect(response).not.toContain('Sorry, I could not generate a reply right now')
        expect(response).not.toContain('I apologize, but I encountered an error')
        expect(response).not.toContain('Please try again')
        
        // Should contain some response about the topic
        expect(response.length).toBeGreaterThan(50)
      }
    })

    it('should handle greeting messages without error messages', async () => {
      const greetings = [
        'Hello',
        'Hi there',
        'Good morning',
        'Hey',
        'Hi, can you help me?'
      ]

      for (const greeting of greetings) {
        const response = await handleAdvancedTelegramQuery(
          testTelegramUserId,
          123456789,
          greeting
        )

        expect(response).toBeDefined()
        expect(response).not.toContain('Sorry, I could not generate a reply right now')
        expect(response).not.toContain('I apologize, but I encountered an error')
        expect(response).not.toContain('Please try again')
        
        expect(response.length).toBeGreaterThan(20)
      }
    })

    it('should handle help requests without error messages', async () => {
      const helpRequests = [
        'Help',
        'I need help',
        'What can you help me with?',
        'How do you work?',
        'Can you assist me?'
      ]

      for (const request of helpRequests) {
        const response = await handleAdvancedTelegramQuery(
          testTelegramUserId,
          123456789,
          request
        )

        expect(response).toBeDefined()
        expect(response).not.toContain('Sorry, I could not generate a reply right now')
        expect(response).not.toContain('I apologize, but I encountered an error')
        expect(response).not.toContain('Please try again')
        
        expect(response.length).toBeGreaterThan(30)
      }
    })

    it('should handle vague or unclear questions gracefully', async () => {
      const vagueQuestions = [
        'Money',
        'Finance',
        'I dont know',
        'Help me with stuff',
        'What should I do?',
        'Tell me something',
        'Random question'
      ]

      for (const question of vagueQuestions) {
        const response = await handleAdvancedTelegramQuery(
          testTelegramUserId,
          123456789,
          question
        )

        expect(response).toBeDefined()
        expect(response).not.toContain('Sorry, I could not generate a reply right now')
        expect(response).not.toContain('I apologize, but I encountered an error')
        expect(response).not.toContain('Please try again')
        
        // Should provide some helpful response or ask for clarification
        expect(response.length).toBeGreaterThan(20)
      }
    })
  })

  describe('Response Quality Validation', () => {
    it('should provide substantial responses for financial advice', async () => {
      const response = await handleAdvancedTelegramQuery(
        testTelegramUserId,
        123456789,
        'How should I manage my personal finances?'
      )

      expect(response).toBeDefined()
      expect(response).not.toContain('Sorry, I could not generate a reply right now')
      expect(response.length).toBeGreaterThan(100) // Substantial response
      
      // Should contain helpful financial terms/concepts
      const financialTerms = ['budget', 'save', 'spend', 'money', 'financial', 'expense', 'income']
      const containsFinancialTerms = financialTerms.some(term => 
        response.toLowerCase().includes(term)
      )
      expect(containsFinancialTerms).toBe(true)
    })

    it('should handle edge cases without breaking', async () => {
      const edgeCases = [
        '', // Empty string
        '   ', // Whitespace only
        'a', // Single character
        '?', // Single punctuation
        '12345', // Numbers only
        'Hello'.repeat(100), // Very long repetitive text
        '🔥💰📊', // Emojis only
      ]

      for (const edgeCase of edgeCases) {
        const response = await handleAdvancedTelegramQuery(
          testTelegramUserId,
          123456789,
          edgeCase
        )

        expect(response).toBeDefined()
        expect(response).not.toContain('Sorry, I could not generate a reply right now')
        expect(typeof response).toBe('string')
        expect(response.length).toBeGreaterThan(0)
      }
    })

    it('should maintain consistency across similar queries', async () => {
      const similarQueries = [
        'How do I budget?',
        'How should I budget?',
        'What is budgeting?',
        'Can you help me budget?'
      ]

      const responses = []
      for (const query of similarQueries) {
        const response = await handleAdvancedTelegramQuery(
          testTelegramUserId,
          123456789,
          query
        )
        responses.push(response)
      }

      // All responses should be valid and contain budgeting information
      responses.forEach(response => {
        expect(response).toBeDefined()
        expect(response).not.toContain('Sorry, I could not generate a reply right now')
        expect(response.toLowerCase()).toContain('budget')
        expect(response.length).toBeGreaterThan(50)
      })
    })
  })

  describe('Error Recovery', () => {
    it('should handle network timeouts gracefully', async () => {
      // Mock a timeout scenario
      const originalMock = require('../../src/lib/gemini').generateGeminiReply
      originalMock.mockRejectedValueOnce(new Error('Request timeout'))

      const response = await handleAdvancedTelegramQuery(
        testTelegramUserId,
        123456789,
        'What can you help me with?'
      )

      expect(response).toBeDefined()
      expect(response).not.toContain('Sorry, I could not generate a reply right now')
      expect(response.length).toBeGreaterThan(20)
    })

    it('should handle rate limiting gracefully', async () => {
      // Test rate limiting by making many rapid requests
      const promises = []
      for (let i = 0; i < 25; i++) { // Exceed typical rate limit
        promises.push(
          handleAdvancedTelegramQuery(
            testTelegramUserId,
            123456789,
            `Test query ${i}`
          )
        )
      }

      const responses = await Promise.all(promises)
      
      // Some responses might be rate limited, but none should have the generic error
      responses.forEach((response, index) => {
        expect(response).toBeDefined()
        if (response.includes('too quickly')) {
          // Rate limiting message is acceptable
          expect(response).toContain('⏱️')
        } else {
          // Normal responses should not have generic error messages
          expect(response).not.toContain('Sorry, I could not generate a reply right now')
        }
      })
    })
  })
})
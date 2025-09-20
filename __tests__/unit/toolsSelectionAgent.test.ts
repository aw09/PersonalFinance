// Unit tests for Tools Selection Agent
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { 
  selectTools, 
  validateToolSelection, 
  generateExecutionSummary 
} from '../../src/lib/toolsSelectionAgent'

// Mock the gemini module
jest.mock('../../src/lib/gemini', () => ({
  generateGeminiReply: jest.fn(),
}))

const mockGenerateGeminiReply = require('../../src/lib/gemini').generateGeminiReply

describe('Tools Selection Agent', () => {
  const mockUserContext = {
    hasWallets: true,
    hasTransactions: true,
    hasBudgets: false,
    hasCategories: true,
    defaultCurrency: 'USD'
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Tool Selection Logic', () => {
    it('should select appropriate tools for transaction queries', async () => {
      mockGenerateGeminiReply
        .mockResolvedValueOnce({
          text: JSON.stringify({
            complexity: 'simple',
            primaryIntent: 'Add expense transaction',
            requiredData: ['wallet_info', 'transaction_data'],
            suggestedTools: ['add_transaction'],
            isMultiStep: false,
            needsContext: true,
            estimatedTools: 1
          })
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            selectedTools: [
              {
                name: 'add_transaction',
                arguments: {
                  amount: 50,
                  description: 'groceries',
                  type: 'expense',
                  wallet_name: 'main'
                }
              }
            ],
            reasoning: 'User wants to add an expense transaction',
            confidence: 0.9
          })
        })

      const result = await selectTools('Add a $50 expense for groceries', mockUserContext)

      expect(result.selectedTools).toHaveLength(1)
      expect(result.selectedTools[0]).toMatchObject({
        name: 'add_transaction',
        arguments: expect.objectContaining({
          amount: 50,
          description: 'groceries',
          type: 'expense'
        })
      })
      expect(result.confidence).toBeGreaterThan(0.8)
    })

    it('should select multiple tools for complex queries', async () => {
      mockGenerateGeminiReply
        .mockResolvedValueOnce({
          text: JSON.stringify({
            complexity: 'complex',
            primaryIntent: 'Financial overview and analysis',
            requiredData: ['wallet_info', 'transaction_data', 'budget_data'],
            suggestedTools: ['get_wallets', 'get_transactions', 'get_budgets'],
            isMultiStep: true,
            needsContext: true,
            estimatedTools: 3
          })
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            selectedTools: [
              { name: 'get_wallets', arguments: {} },
              { name: 'get_transactions', arguments: { limit: 10 } },
              { name: 'get_budgets', arguments: {} }
            ],
            reasoning: 'User needs comprehensive financial overview',
            confidence: 0.85
          })
        })

      const result = await selectTools('Show me a complete overview of my finances', mockUserContext)

      expect(result.selectedTools).toHaveLength(3)
      expect(result.selectedTools.map(t => t.name)).toContain('get_wallets')
      expect(result.selectedTools.map(t => t.name)).toContain('get_transactions')
      expect(result.selectedTools.map(t => t.name)).toContain('get_budgets')
    })

    it('should return no tools for general questions', async () => {
      mockGenerateGeminiReply
        .mockResolvedValueOnce({
          text: JSON.stringify({
            complexity: 'simple',
            primaryIntent: 'Request for financial advice',
            requiredData: ['general_knowledge'],
            suggestedTools: [],
            isMultiStep: false,
            needsContext: false,
            estimatedTools: 0
          })
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            selectedTools: [],
            reasoning: 'General financial advice question that can be answered without tools',
            confidence: 0.8
          })
        })

      const result = await selectTools('How should I budget my money?', mockUserContext)

      expect(result.selectedTools).toHaveLength(0)
      expect(result.reasoning).toContain('General')
      expect(result.confidence).toBeGreaterThan(0.7)
    })

    it('should use fallback logic when AI fails', async () => {
      mockGenerateGeminiReply.mockRejectedValue(new Error('API Error'))

      const result = await selectTools('show my transactions', mockUserContext)

      expect(result.selectedTools).toHaveLength(1)
      expect(result.selectedTools[0].name).toBe('get_transactions')
      expect(result.reasoning).toContain('Fallback')
    })

    it('should detect general question patterns in fallback', async () => {
      mockGenerateGeminiReply.mockRejectedValue(new Error('API Error'))

      const generalQuestions = [
        'How do I save money?',
        'What is compound interest?',
        'Explain budgeting strategies',
        'Why should I invest?',
        'Tell me about retirement planning'
      ]

      for (const question of generalQuestions) {
        const result = await selectTools(question, mockUserContext)
        
        expect(result.selectedTools).toHaveLength(0)
        expect(result.reasoning).toContain('General question')
        expect(result.confidence).toBeGreaterThan(0.7)
      }
    })
  })

  describe('Tool Validation', () => {
    it('should validate correct tool selections', () => {
      const validSelection = {
        selectedTools: [
          {
            name: 'add_transaction',
            arguments: {
              amount: 100,
              description: 'test',
              type: 'expense',
              wallet_name: 'main'
            }
          }
        ],
        executionPlan: [],
        reasoning: 'Valid tool selection',
        confidence: 0.9
      }

      expect(validateToolSelection(validSelection)).toBe(true)
    })

    it('should reject invalid tool names', () => {
      const invalidSelection = {
        selectedTools: [
          {
            name: 'invalid_tool',
            arguments: {}
          }
        ],
        executionPlan: [],
        reasoning: 'Invalid tool selection',
        confidence: 0.5
      }

      expect(validateToolSelection(invalidSelection)).toBe(false)
    })
  })

  describe('Execution Planning', () => {
    it('should create proper execution plans with dependencies', async () => {
      mockGenerateGeminiReply
        .mockResolvedValueOnce({
          text: JSON.stringify({
            complexity: 'moderate',
            primaryIntent: 'Create wallet and add transaction',
            requiredData: ['wallet_creation', 'transaction_data'],
            suggestedTools: ['create_wallet', 'add_transaction'],
            isMultiStep: true,
            needsContext: true,
            estimatedTools: 2
          })
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            selectedTools: [
              {
                name: 'create_wallet',
                arguments: { name: 'Savings', currency: 'USD' }
              },
              {
                name: 'add_transaction',
                arguments: {
                  amount: 1000,
                  description: 'Initial deposit',
                  type: 'income',
                  wallet_name: 'Savings'
                }
              }
            ],
            reasoning: 'Need to create wallet first, then add transaction',
            confidence: 0.85
          })
        })

      const result = await selectTools('Create a savings wallet and add $1000 initial deposit', mockUserContext)

      expect(result.executionPlan).toHaveLength(2)
      expect(result.executionPlan[0].toolCall.name).toBe('create_wallet')
      expect(result.executionPlan[1].toolCall.name).toBe('add_transaction')
      expect(result.executionPlan[1].dependsOn).toContain(1) // Depends on step 1
    })

    it('should generate execution summaries', () => {
      const executionPlan = [
        {
          stepNumber: 1,
          toolCall: { name: 'get_wallets', arguments: {} },
          description: 'Retrieve all wallets',
          dependsOn: [],
          isOptional: false
        },
        {
          stepNumber: 2,
          toolCall: { name: 'get_transactions', arguments: { limit: 5 } },
          description: 'Retrieve 5 recent transactions',
          dependsOn: [],
          isOptional: false
        }
      ]

      const summary = generateExecutionSummary(executionPlan)
      
      expect(summary).toContain('2 required step(s)')
      expect(summary).not.toContain('optional')
    })

    it('should handle optional steps in execution summary', () => {
      const executionPlan = [
        {
          stepNumber: 1,
          toolCall: { name: 'get_wallets', arguments: {} },
          description: 'Retrieve all wallets',
          dependsOn: [],
          isOptional: false
        },
        {
          stepNumber: 2,
          toolCall: { name: 'get_categories', arguments: {} },
          description: 'Retrieve categories',
          dependsOn: [],
          isOptional: true
        }
      ]

      const summary = generateExecutionSummary(executionPlan)
      
      expect(summary).toContain('1 required step(s)')
      expect(summary).toContain('1 optional step(s)')
    })
  })

  describe('Context Integration', () => {
    it('should adapt tool selection based on user context', async () => {
      const newUserContext = {
        hasWallets: false,
        hasTransactions: false,
        hasBudgets: false,
        hasCategories: false,
        defaultCurrency: 'EUR'
      }

      mockGenerateGeminiReply
        .mockResolvedValueOnce({
          text: JSON.stringify({
            complexity: 'simple',
            primaryIntent: 'User needs to create first wallet',
            requiredData: ['wallet_creation'],
            suggestedTools: ['create_wallet'],
            isMultiStep: false,
            needsContext: true,
            estimatedTools: 1
          })
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            selectedTools: [
              {
                name: 'create_wallet',
                arguments: {
                  name: 'Main',
                  currency: 'EUR'
                }
              }
            ],
            reasoning: 'New user needs their first wallet',
            confidence: 0.9
          })
        })

      const result = await selectTools('I want to start tracking my money', newUserContext)

      expect(result.selectedTools).toHaveLength(1)
      expect(result.selectedTools[0].name).toBe('create_wallet')
      expect(result.selectedTools[0].arguments.currency).toBe('EUR')
    })

    it('should fill default parameters from context', async () => {
      const contextWithDefaults = {
        ...mockUserContext,
        defaultCurrency: 'GBP'
      }

      mockGenerateGeminiReply
        .mockResolvedValueOnce({
          text: JSON.stringify({
            complexity: 'simple',
            primaryIntent: 'Add transaction',
            requiredData: ['transaction_data'],
            suggestedTools: ['add_transaction'],
            isMultiStep: false,
            needsContext: true,
            estimatedTools: 1
          })
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            selectedTools: [
              {
                name: 'add_transaction',
                arguments: {
                  amount: 25,
                  description: 'coffee',
                  type: 'expense'
                  // Note: no currency specified
                }
              }
            ],
            reasoning: 'Add coffee expense',
            confidence: 0.85
          })
        })

      const result = await selectTools('I bought coffee for £25', contextWithDefaults)

      // The system should fill in defaults based on context
      expect(result.selectedTools[0].arguments).toMatchObject({
        amount: 25,
        description: 'coffee',
        type: 'expense'
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed AI responses gracefully', async () => {
      mockGenerateGeminiReply
        .mockResolvedValueOnce({
          text: 'Invalid JSON response'
        })

      const result = await selectTools('test query', mockUserContext)

      expect(result.selectedTools).toBeDefined()
      expect(result.reasoning).toContain('Fallback')
      expect(result.confidence).toBeLessThan(0.5)
    })

    it('should limit the number of selected tools', async () => {
      mockGenerateGeminiReply
        .mockResolvedValueOnce({
          text: JSON.stringify({
            complexity: 'complex',
            primaryIntent: 'Multiple operations',
            requiredData: ['everything'],
            suggestedTools: ['get_wallets', 'get_transactions', 'get_budgets', 'get_categories'],
            isMultiStep: true,
            needsContext: true,
            estimatedTools: 10
          })
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            selectedTools: Array.from({ length: 10 }, (_, i) => ({
              name: 'get_wallets',
              arguments: { id: i }
            })),
            reasoning: 'Too many tools selected',
            confidence: 0.3
          })
        })

      const result = await selectTools('Do everything', mockUserContext, { maxTools: 3 })

      expect(result.selectedTools.length).toBeLessThanOrEqual(3)
    })
  })
})
// Unit tests for Receipt Processing Flow
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { handleReceiptProcessing } from '../../src/lib/geminiAgentV3'
import { processMultiModalInput } from '../../src/lib/multiModalAgent'

// Mock dependencies
jest.mock('../../src/lib/telegramAuth', () => ({
  getTelegramUser: jest.fn(),
}))

jest.mock('../../src/lib/telegramCrud', () => ({
  getTelegramUserWallets: jest.fn(),
}))

jest.mock('../../src/lib/agentOrchestrator', () => ({
  orchestrateQuery: jest.fn(),
}))

const mockGetTelegramUser = require('../../src/lib/telegramAuth').getTelegramUser
const mockGetTelegramUserWallets = require('../../src/lib/telegramCrud').getTelegramUserWallets  
const mockOrchestrateQuery = require('../../src/lib/agentOrchestrator').orchestrateQuery

describe('Receipt Processing Flow', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com'
  }

  const mockWallets = [
    {
      id: 'wallet-1',
      name: 'Main Wallet',
      currency: 'USD',
      balance: 1000
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetTelegramUser.mockResolvedValue(mockUser)
    mockGetTelegramUserWallets.mockResolvedValue(mockWallets)
  })

  describe('Receipt Image Processing', () => {
    it('should process receipt image and extract transaction data', async () => {
      const mockReceiptData = {
        merchant: 'Grocery Store',
        date: '2024-01-15',
        total: 45.67, 
        currency: 'USD',
        items: [
          { description: 'Milk', price: 4.99 },
          { description: 'Bread', price: 2.50 },
          { description: 'Eggs', price: 3.99 },
          { description: 'Other groceries', price: 34.19 }
        ]
      }

      mockOrchestrateQuery.mockResolvedValue({
        finalResponse: 'Successfully processed your receipt and created a transaction for $45.67 at Grocery Store.',
        rawData: {
          structuredData: mockReceiptData
        },
        confidence: {
          overall: 90,
          reasoning: 'High confidence receipt processing'
        },
        security: {
          isSafe: true,
          threatLevel: 'none'
        },
        processing: {
          stepsExecuted: ['multimodal_processing', 'tool_execution'],
          toolsUsed: ['add_transaction'],
          knowledgeUsed: 0,
          totalTime: 2500
        }
      })

      const mockImageFile = new File(['mock receipt image'], 'receipt.jpg', { type: 'image/jpeg' })
      
      const response = await handleReceiptProcessing(
        123456789,
        mockImageFile,
        { autoCreateTransaction: true }
      )

      expect(response).toBeDefined()
      expect(response).toContain('Successfully processed')
      expect(response).toContain('$45.67')
      expect(response).toContain('Grocery Store')
      
      // Should include receipt details
      expect(response).toContain('Receipt Details')
      expect(response).toContain('🏪 Merchant: Grocery Store')
      expect(response).toContain('📅 Date: 2024-01-15')
      expect(response).toContain('💰 Total: $45.67')
      expect(response).toContain('🛒 Items:')
      expect(response).toContain('• Milk - $4.99')
      expect(response).toContain('• Bread - $2.50')
      expect(response).toContain('• Eggs - $3.99')

      expect(mockOrchestrateQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          userInput: mockImageFile,
          userId: mockUser.id,
          telegramUserId: 123456789,
          context: expect.objectContaining({
            hasWallets: true,
            defaultCurrency: 'USD'
          }),
          options: expect.objectContaining({
            includeConfidence: true,
            enableRAG: false,
            securityLevel: 'low',
            maxTools: 2
          })
        })
      )
    })

    it('should handle receipts with many items by truncating display', async () => {
      const mockReceiptData = {
        merchant: 'Big Box Store',
        date: '2024-01-15',
        total: 156.78,
        currency: 'USD',
        items: Array.from({ length: 10 }, (_, i) => ({
          description: `Item ${i + 1}`,
          price: 15.67
        }))
      }

      mockOrchestrateQuery.mockResolvedValue({
        finalResponse: 'Receipt processed successfully.',
        rawData: {
          structuredData: mockReceiptData
        },
        security: { isSafe: true, threatLevel: 'none' },
        processing: { stepsExecuted: [], toolsUsed: [], knowledgeUsed: 0, totalTime: 1000 }
      })

      const mockImageBuffer = new ArrayBuffer(1024)
      
      const response = await handleReceiptProcessing(123456789, mockImageBuffer)

      expect(response).toContain('🛒 Items:')
      expect(response).toContain('• Item 1')
      expect(response).toContain('• Item 2')
      expect(response).toContain('• Item 3')
      expect(response).toContain('... and 7 more items')
    })

    it('should handle user without wallets', async () => {
      mockGetTelegramUserWallets.mockResolvedValue([])

      const mockImageFile = new File(['mock image'], 'receipt.jpg', { type: 'image/jpeg' })
      
      const response = await handleReceiptProcessing(123456789, mockImageFile)

      expect(response).toContain('💳 You need to create a wallet first')
      expect(response).toContain('create wallet')
      expect(mockOrchestrateQuery).not.toHaveBeenCalled()
    })

    it('should handle unlinked telegram user', async () => {
      mockGetTelegramUser.mockResolvedValue(null)

      const mockImageFile = new File(['mock image'], 'receipt.jpg', { type: 'image/jpeg' })
      
      const response = await handleReceiptProcessing(123456789, mockImageFile)

      expect(response).toContain('❌ Your account isn\'t linked yet')
      expect(response).toContain('/link')
      expect(mockOrchestrateQuery).not.toHaveBeenCalled()
    })
  })

  describe('Receipt Processing Options', () => {
    it('should handle auto-create transaction disabled', async () => {
      mockOrchestrateQuery.mockResolvedValue({
        finalResponse: 'Receipt analyzed but no transaction created.',
        rawData: {
          structuredData: {
            merchant: 'Test Store',
            total: 25.00,
            currency: 'USD'
          }
        },
        security: { isSafe: true, threatLevel: 'none' },
        processing: { stepsExecuted: [], toolsUsed: [], knowledgeUsed: 0, totalTime: 1000 }
      })

      const mockImageFile = new File(['mock image'], 'receipt.jpg', { type: 'image/jpeg' })
      
      const response = await handleReceiptProcessing(
        123456789,
        mockImageFile,
        { autoCreateTransaction: false, requestConfirmation: false }
      )

      expect(response).toContain('Receipt analyzed')
      expect(response).toContain('Receipt Details')
      expect(response).not.toContain('Transaction has been automatically created')
    })

    it('should handle confirmation requests', async () => {
      mockOrchestrateQuery.mockResolvedValue({
        finalResponse: 'Receipt processed with confirmation.',
        rawData: {
          structuredData: {
            merchant: 'Test Store',
            total: 25.00,
            currency: 'USD'
          }
        },
        security: { isSafe: true, threatLevel: 'none' },
        processing: { stepsExecuted: [], toolsUsed: [], knowledgeUsed: 0, totalTime: 1000 }
      })

      const mockImageFile = new File(['mock image'], 'receipt.jpg', { type: 'image/jpeg' })
      
      const response = await handleReceiptProcessing(
        123456789,
        mockImageFile,
        { autoCreateTransaction: true, requestConfirmation: true }
      )

      expect(response).toContain('✅ Transaction has been automatically created')
      expect(response).toContain('transaction history')
    })
  })

  describe('Error Handling', () => {
    it('should handle processing errors gracefully', async () => {
      mockOrchestrateQuery.mockRejectedValue(new Error('Processing failed'))

      const mockImageFile = new File(['mock image'], 'receipt.jpg', { type: 'image/jpeg' })
      
      const response = await handleReceiptProcessing(123456789, mockImageFile)

      expect(response).toContain('❌ I had trouble processing your receipt')
      expect(response).toContain('clearer image')
      expect(response).toContain('manually')
    })

    it('should handle invalid image formats', async () => {
      const mockTextFile = new File(['not an image'], 'document.txt', { type: 'text/plain' })
      
      const response = await handleReceiptProcessing(123456789, mockTextFile)

      // Should still attempt processing but may fail gracefully
      expect(response).toBeDefined()
      expect(typeof response).toBe('string')
    })

    it('should handle empty or corrupted images', async () => {
      const mockEmptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' })
      
      mockOrchestrateQuery.mockResolvedValue({
        finalResponse: 'Unable to extract data from the image.',
        rawData: {
          structuredData: null
        },
        security: { isSafe: true, threatLevel: 'none' },
        processing: { stepsExecuted: [], toolsUsed: [], knowledgeUsed: 0, totalTime: 1000 }
      })
      
      const response = await handleReceiptProcessing(123456789, mockEmptyFile)

      expect(response).toBeDefined()
      expect(response).toContain('Unable to extract data')
    })
  })

  describe('Receipt Data Validation', () => {
    it('should handle receipts with missing merchant information', async () => {
      const incompleteReceiptData = {
        date: '2024-01-15',
        total: 25.99,
        currency: 'USD',
        items: [{ description: 'Unknown item', price: 25.99 }]
      }

      mockOrchestrateQuery.mockResolvedValue({
        finalResponse: 'Receipt processed with partial information.',
        rawData: {
          structuredData: incompleteReceiptData
        },
        security: { isSafe: true, threatLevel: 'none' },
        processing: { stepsExecuted: [], toolsUsed: [], knowledgeUsed: 0, totalTime: 1000 }
      })

      const mockImageFile = new File(['mock image'], 'receipt.jpg', { type: 'image/jpeg' })
      
      const response = await handleReceiptProcessing(123456789, mockImageFile)

      expect(response).toContain('Receipt Details')
      expect(response).toContain('📅 Date: 2024-01-15')
      expect(response).toContain('💰 Total: $25.99')
      expect(response).not.toContain('🏪 Merchant:') // Should not show empty merchant
    })

    it('should handle receipts with missing date information', async () => {
      const incompleteReceiptData = {
        merchant: 'Unknown Store',
        total: 15.50,
        currency: 'USD'
      }

      mockOrchestrateQuery.mockResolvedValue({
        finalResponse: 'Receipt processed with partial information.',
        rawData: {
          structuredData: incompleteReceiptData
        },
        security: { isSafe: true, threatLevel: 'none' },
        processing: { stepsExecuted: [], toolsUsed: [], knowledgeUsed: 0, totalTime: 1000 }
      })

      const mockImageFile = new File(['mock image'], 'receipt.jpg', { type: 'image/jpeg' })
      
      const response = await handleReceiptProcessing(123456789, mockImageFile)

      expect(response).toContain('Receipt Details')
      expect(response).toContain('🏪 Merchant: Unknown Store')
      expect(response).toContain('💰 Total: $15.50')
      expect(response).not.toContain('📅 Date:') // Should not show empty date
    })

    it('should handle receipts with no itemized data', async () => {
      const receiptDataNoItems = {
        merchant: 'Quick Shop',
        date: '2024-01-15',
        total: 8.99,
        currency: 'USD'
      }

      mockOrchestrateQuery.mockResolvedValue({
        finalResponse: 'Receipt processed without item details.',
        rawData: {
          structuredData: receiptDataNoItems
        },
        security: { isSafe: true, threatLevel: 'none' },
        processing: { stepsExecuted: [], toolsUsed: [], knowledgeUsed: 0, totalTime: 1000 }
      })

      const mockImageFile = new File(['mock image'], 'receipt.jpg', { type: 'image/jpeg' })
      
      const response = await handleReceiptProcessing(123456789, mockImageFile)

      expect(response).toContain('Receipt Details')
      expect(response).toContain('🏪 Merchant: Quick Shop')
      expect(response).toContain('💰 Total: $8.99')
      expect(response).not.toContain('🛒 Items:') // Should not show empty items section
    })
  })
})
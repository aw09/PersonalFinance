// Unit tests for MultiModal Agent
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { 
  processMultiModalInput, 
  isSupportedImageFormat, 
  getProcessingTimeMessage,
  generateExtractionSummary 
} from '../../src/lib/multiModalAgent'

// Mock the gemini module
jest.mock('../../src/lib/gemini', () => ({
  generateGeminiReply: jest.fn(),
}))

const mockGenerateGeminiReply = require('../../src/lib/gemini').generateGeminiReply

describe('MultiModal Agent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGenerateGeminiReply.mockResolvedValue({
      text: 'Mocked response'
    })
  })

  describe('processMultiModalInput', () => {
    it('should handle text input directly', async () => {
      const result = await processMultiModalInput('Hello, this is a test message')
      
      expect(result).toMatchObject({
        extractedText: 'Hello, this is a test message',
        contentType: expect.any(String),
        confidence: 1.0,
        originalFormat: 'plain_text'
      })
    })

    it('should process base64 image data', async () => {
      mockGenerateGeminiReply.mockResolvedValue({
        text: 'Receipt from Grocery Store\nTotal: $25.99\nDate: 2024-01-15'
      })

      const base64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD...'
      const result = await processMultiModalInput(base64Image, {
        expectedType: 'receipt',
        extractStructuredData: true
      })

      expect(result).toMatchObject({
        extractedText: expect.stringContaining('Receipt'),
        contentType: 'receipt',
        confidence: expect.any(Number),
        originalFormat: 'base64_image'
      })
      expect(mockGenerateGeminiReply).toHaveBeenCalledWith(
        expect.stringContaining('receipt'),
        expect.objectContaining({
          intent: 'image_text_extraction',
          imageUrl: base64Image
        })
      )
    })

    it('should handle File objects', async () => {
      const mockFile = new File(['mock image data'], 'receipt.jpg', { type: 'image/jpeg' })
      
      // Mock FileReader
      const mockFileReader = {
        onload: null,
        onerror: null,
        readAsDataURL: jest.fn(),
        result: 'data:image/jpeg;base64,mockedbase64data'
      }
      
      global.FileReader = jest.fn(() => mockFileReader) as any

      mockGenerateGeminiReply.mockResolvedValue({
        text: 'Store Receipt\nItem: Coffee - $4.50\nTotal: $4.50'
      })

      // Simulate FileReader success
      setTimeout(() => {
        if (mockFileReader.onload) {
          mockFileReader.onload({} as any)
        }
      }, 10)

      const result = await processMultiModalInput(mockFile)

      expect(result).toMatchObject({
        contentType: expect.any(String),
        originalFormat: 'file_upload',
        confidence: expect.any(Number)
      })
    })

    it('should handle processing errors gracefully', async () => {
      mockGenerateGeminiReply.mockRejectedValue(new Error('API Error'))

      const result = await processMultiModalInput('data:image/jpeg;base64,invalid')

      expect(result).toMatchObject({
        extractedText: '',
        contentType: 'unknown',
        confidence: 0,
        originalFormat: 'base64_image'
      })
    })

    it('should extract structured data for receipts', async () => {
      mockGenerateGeminiReply
        .mockResolvedValueOnce({
          text: 'Receipt from Target\nTotal: $45.67\nDate: 2024-01-15'
        })
        .mockResolvedValueOnce({
          text: 'receipt'
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            merchant: 'Target',
            total: 45.67,
            currency: 'USD',
            date: '2024-01-15',
            items: [
              { description: 'Grocery items', price: 45.67 }
            ]
          })
        })

      const result = await processMultiModalInput('data:image/jpeg;base64,receipt_image', {
        extractStructuredData: true
      })

      expect(result).toMatchObject({
        contentType: 'receipt',
        extractedData: expect.objectContaining({
          merchant: 'Target',
          total: 45.67,
          currency: 'USD'
        })
      })
    })
  })

  describe('Utility Functions', () => {
    it('should identify supported image formats', () => {
      expect(isSupportedImageFormat('image/jpeg')).toBe(true)
      expect(isSupportedImageFormat('image/png')).toBe(true)
      expect(isSupportedImageFormat('image/gif')).toBe(true)
      expect(isSupportedImageFormat('image/webp')).toBe(true)
      expect(isSupportedImageFormat('text/plain')).toBe(false)
      expect(isSupportedImageFormat('application/pdf')).toBe(false)
    })

    it('should generate appropriate processing time messages', () => {
      expect(getProcessingTimeMessage(500)).toContain('instantly')
      expect(getProcessingTimeMessage(3000)).toContain('quickly')
      expect(getProcessingTimeMessage(7000)).toContain('completed')
      expect(getProcessingTimeMessage(15000)).toContain('longer than expected')
    })

    it('should generate extraction summaries', () => {
      const mockResult = {
        contentType: 'receipt' as const,
        confidence: 0.85,
        extractedData: {
          total: 25.99,
          currency: 'USD',
          merchant: 'Grocery Store'
        },
        processingTime: 2500
      }

      const summary = generateExtractionSummary(mockResult)
      
      expect(summary).toContain('receipt')
      expect(summary).toContain('85%')
      expect(summary).toContain('$25.99')
      expect(summary).toContain('Grocery Store')
    })
  })

  describe('Content Classification', () => {
    it('should classify receipt content correctly', async () => {
      mockGenerateGeminiReply.mockResolvedValue({
        text: 'Walmart Receipt\nSubtotal: $23.45\nTax: $2.54\nTotal: $25.99'
      })

      const result = await processMultiModalInput('receipt_text_data')
      
      // The content should be classified as receipt-related
      expect(result.contentType).toBe('receipt')
    })

    it('should classify document content correctly', async () => {
      mockGenerateGeminiReply.mockResolvedValue({
        text: 'Bank Statement\nAccount Balance: $1,234.56\nTransaction History'
      })

      const result = await processMultiModalInput('document_text_data')
      
      expect(result.contentType).toBe('document')
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid image URLs', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      const result = await processMultiModalInput('http://invalid-url.com/image.jpg')

      expect(result).toMatchObject({
        extractedText: '',
        contentType: 'unknown',
        confidence: 0
      })
    })

    it('should handle malformed base64 data', async () => {
      const result = await processMultiModalInput('data:image/jpeg;base64,invalid-base64-data')

      expect(result).toMatchObject({
        extractedText: expect.any(String),
        contentType: expect.any(String),
        confidence: expect.any(Number)
      })
    })
  })
})
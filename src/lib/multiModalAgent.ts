// MultiModal Agent
// Converts non-text inputs (images, receipts, documents) to text for processing

// Lazy require generateGeminiReply where needed so tests can mock it

export interface MultiModalResult {
  extractedText: string
  contentType: 'receipt' | 'document' | 'chart' | 'table' | 'handwriting' | 'unknown'
  confidence: number
  extractedData?: StructuredData
  processingTime: number
  originalFormat: string
}

export interface StructuredData {
  // For receipts
  merchant?: string
  date?: string
  total?: number
  currency?: string
  items?: Array<{
    description: string
    quantity?: number
    price?: number
  }>
  
  // For financial documents
  accountNumber?: string
  balance?: number
  transactions?: Array<{
    date: string
    description: string
    amount: number
    type: 'credit' | 'debit'
  }>
  
  // For charts/tables
  data?: Array<{
    label: string
    value: number
    category?: string
  }>
  
  // Generic key-value pairs
  metadata?: Record<string, any>
}

export interface MultiModalOptions {
  expectedType?: 'receipt' | 'document' | 'chart' | 'table'
  extractStructuredData?: boolean
  userId?: string
  language?: string
}

// Main multimodal processing function
export async function processMultiModalInput(
  input: string | ArrayBuffer | File,
  options: MultiModalOptions = {}
): Promise<MultiModalResult> {
  const startTime = Date.now()
  const { expectedType, extractStructuredData = true, userId, language = 'en' } = options

  try {
    // Step 1: Determine input type and prepare for processing
    const inputInfo = await analyzeInput(input)
    
    // Step 2: Extract text using appropriate method
    const textResult = await extractTextFromInput(input, inputInfo, options)
    
    // Step 3: Analyze and classify content
    const contentType = expectedType || await classifyContent(textResult.text, userId)
    
    // Step 4: Extract structured data if requested
      let structuredData: StructuredData | undefined
      if (extractStructuredData) {
        structuredData = await extractStructuredDataFromText(textResult.text, contentType, userId)
      }
    
    const processingTime = Date.now() - startTime
    
    return {
      extractedText: textResult.text,
      contentType,
      confidence: textResult.confidence,
      extractedData: structuredData,
      processingTime,
      originalFormat: inputInfo.format
    }
  } catch (error) {
  const err = error instanceof Error ? error : new Error(String(error))
  console.error('MultiModal processing error:', { message: err.message, stack: err.stack })
    return {
      extractedText: '',
      contentType: 'unknown',
      confidence: 0,
      processingTime: Date.now() - startTime,
      originalFormat: 'unknown'
    }
  }
}

// Analyze input type and format
async function analyzeInput(input: string | ArrayBuffer | File): Promise<InputInfo> {
  if (typeof input === 'string') {
    // Check if it's a URL or base64 encoded data
    if (input.startsWith('http') || input.startsWith('https')) {
      return { type: 'url', format: 'image_url', mimeType: 'unknown' }
    } else if (input.startsWith('data:')) {
      const mimeMatch = input.match(/data:([^;]+);/)
      return { 
        type: 'base64', 
        format: 'base64_image', 
        mimeType: mimeMatch ? mimeMatch[1] : 'unknown' 
      }
    } else {
      // Assume it's plain text
      return { type: 'text', format: 'plain_text', mimeType: 'text/plain' }
    }
  } else if (input instanceof File) {
    return { 
      type: 'file', 
      format: 'file_upload', 
      mimeType: input.type || 'unknown',
      fileName: input.name
    }
  } else if (input instanceof ArrayBuffer) {
    return { type: 'buffer', format: 'array_buffer', mimeType: 'unknown' }
  }

  return { type: 'unknown', format: 'unknown', mimeType: 'unknown' }
}

// Extract text from various input formats
async function extractTextFromInput(
  input: string | ArrayBuffer | File,
  inputInfo: InputInfo,
  options: MultiModalOptions
): Promise<{ text: string; confidence: number }> {
  const { userId } = options

  if (inputInfo.type === 'text') {
    return { text: input as string, confidence: 1.0 }
  }

  // For image inputs, use Gemini Vision API
  if (inputInfo.format.includes('image') || inputInfo.mimeType?.startsWith('image/')) {
    return await extractTextFromImage(input, inputInfo, userId)
  }

  // For other file types, return error or attempt basic processing
  throw new Error(`Unsupported input format: ${inputInfo.format}`)
}

// Extract text from images using Gemini Vision
async function extractTextFromImage(
  input: string | ArrayBuffer | File,
  inputInfo: InputInfo,
  userId?: string
): Promise<{ text: string; confidence: number }> {
  try {
    let imageUrl: string | undefined

    // Handle different input types
    if (typeof input === 'string' && input.startsWith('http')) {
      imageUrl = input
    } else if (typeof input === 'string' && input.startsWith('data:')) {
      // Base64 data - we'll pass this directly to Gemini
      imageUrl = input
    } else if (input instanceof File) {
      // Convert File to base64
      const base64 = await fileToBase64(input)
      imageUrl = base64
    } else if (input instanceof ArrayBuffer) {
      // Convert ArrayBuffer to base64
      const base64 = arrayBufferToBase64(input, inputInfo.mimeType || 'image/jpeg')
      imageUrl = base64
    }

    if (!imageUrl) {
      throw new Error('Could not process image input')
    }

    const visionPrompt = `Analyze this image and extract all visible text. Focus on:

1. **Receipt/Invoice Data**: If this is a receipt or invoice, extract:
   - Merchant/store name
   - Date and time
   - Total amount and currency
   - Individual items with prices
   - Payment method
   - Any other relevant financial information

2. **Financial Documents**: If this is a bank statement or financial document, extract:
   - Account information
   - Transaction details
   - Balances
   - Dates and amounts

3. **Charts/Tables**: If this contains financial charts or tables, extract:
   - All numerical data
   - Labels and categories
   - Trends or patterns

4. **General Text**: Extract any other visible text clearly and accurately.

Please provide the extracted text in a clear, structured format. If this appears to be a receipt, format it as a receipt. If it's a document, maintain the document structure. Be as accurate as possible with numbers, dates, and monetary amounts.

If the image is unclear or text is hard to read, mention the confidence level for different parts.`

  const { generateGeminiReply } = require('./gemini')
  const response = await generateGeminiReply(visionPrompt, {
      userId,
      intent: 'image_text_extraction',
      imageUrl: imageUrl
    })

    // Estimate confidence based on response length and content
    const confidence = estimateExtractionConfidence(response.text)

    return {
      text: response.text,
      confidence
    }
  } catch (error) {
  const err = error instanceof Error ? error : new Error(String(error))
  console.error('Image text extraction error:', { message: err.message, stack: err.stack })
    return {
      text: 'Error: Could not extract text from image',
      confidence: 0
    }
  }
}

// Classify content type based on extracted text
async function classifyContent(text: string, userId?: string): Promise<MultiModalResult['contentType']> {
  const lowerText = text.toLowerCase()

  // Simple pattern matching for common types
  if (isReceipt(lowerText)) return 'receipt'
  if (isFinancialDocument(lowerText)) return 'document'
  if (isChart(lowerText)) return 'chart'
  if (isTable(lowerText)) return 'table'
  if (isHandwriting(lowerText)) return 'handwriting'

  // Use AI for more complex classification
  try {
    const classificationPrompt = `Classify this extracted text into one of these categories:
- receipt: Shopping receipts, invoices, bills
- document: Financial statements, bank documents, reports
- chart: Charts, graphs, visual data representations
- table: Data tables, spreadsheets, structured data
- handwriting: Handwritten notes, forms
- unknown: Cannot determine or doesn't fit categories

Text to classify:
"${text.substring(0, 500)}..."

Respond with just the category name.`

  const { generateGeminiReply } = require('./gemini')
  const response = await generateGeminiReply(classificationPrompt, {
      userId,
      intent: 'content_classification'
    })

    const classification = response.text.toLowerCase().trim()
    const validTypes: MultiModalResult['contentType'][] = ['receipt', 'document', 'chart', 'table', 'handwriting', 'unknown']
    
    return validTypes.includes(classification as any) ? classification as MultiModalResult['contentType'] : 'unknown'
  } catch (error) {
  const err = error instanceof Error ? error : new Error(String(error))
  console.error('Content classification error:', { message: err.message, stack: err.stack })
    return 'unknown'
  }
}

// Extract structured data based on content type
async function extractStructuredDataFromText(
  text: string,
  contentType: MultiModalResult['contentType'],
  userId?: string
): Promise<StructuredData | undefined> {
  try {
    switch (contentType) {
      case 'receipt':
        return await extractReceiptData(text, userId)
      case 'document':
        return await extractDocumentData(text, userId)
      case 'chart':
      case 'table':
        return await extractTableData(text, userId)
      default:
        return undefined
    }
  } catch (error) {
  const err = error instanceof Error ? error : new Error(String(error))
  console.error('Structured data extraction error:', { message: err.message, stack: err.stack })
    return undefined
  }
}

// Extract receipt-specific data
async function extractReceiptData(text: string, userId?: string): Promise<StructuredData> {
  const receiptPrompt = `Extract structured data from this receipt text and respond with JSON:

${text}

Extract the following information and format as JSON:
{
  "merchant": "store name",
  "date": "YYYY-MM-DD format",
  "total": numeric_amount,
  "currency": "USD/EUR/etc",
  "items": [
    {
      "description": "item name",
      "quantity": number_or_null,
      "price": numeric_amount
    }
  ],
  "metadata": {
    "paymentMethod": "cash/card/etc",
    "time": "HH:MM if available",
    "location": "address if available"
  }
}

If any information is not available, use null. Be accurate with numbers and dates.`

  try {
  const { generateGeminiReply } = require('./gemini')
  const response = await generateGeminiReply(receiptPrompt, {
      userId,
      intent: 'receipt_data_extraction'
    })

    const data = extractJSON(response.text)
    return data || { metadata: { extractionError: 'Failed to parse receipt data' } }
  } catch (error) {
  const err = error instanceof Error ? error : new Error(String(error))
  return { metadata: { extractionError: err.message } }
  }
}

// Extract financial document data
async function extractDocumentData(text: string, userId?: string): Promise<StructuredData> {
  const documentPrompt = `Extract financial data from this document and respond with JSON:

${text}

Extract relevant financial information:
{
  "accountNumber": "account number if available",
  "balance": numeric_balance,
  "currency": "currency code",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "transaction description",
      "amount": numeric_amount,
      "type": "credit or debit"
    }
  ],
  "metadata": {
    "documentType": "statement/report/etc",
    "period": "date range if available",
    "institution": "bank/company name"
  }
}

Focus on numerical data and dates. Use null for unavailable information.`

  try {
  const { generateGeminiReply } = require('./gemini')
  const response = await generateGeminiReply(documentPrompt, {
      userId,
      intent: 'document_data_extraction'
    })

    const data = extractJSON(response.text)
    return data || { metadata: { extractionError: 'Failed to parse document data' } }
  } catch (error) {
  const err = error instanceof Error ? error : new Error(String(error))
  return { metadata: { extractionError: err.message } }
  }
}

// Extract table/chart data
async function extractTableData(text: string, userId?: string): Promise<StructuredData> {
  const tablePrompt = `Extract tabular data from this text and respond with JSON:

${text}

Format as:
{
  "data": [
    {
      "label": "row/category name",
      "value": numeric_value,
      "category": "category if applicable"
    }
  ],
  "metadata": {
    "title": "chart/table title",
    "type": "bar/line/pie/table/etc",
    "unit": "currency/percentage/etc"
  }
}

Focus on extracting numerical data points and their labels accurately.`

  try {
  const { generateGeminiReply } = require('./gemini')
  const response = await generateGeminiReply(tablePrompt, {
      userId,
      intent: 'table_data_extraction'
    })

    const data = extractJSON(response.text)
    return data || { metadata: { extractionError: 'Failed to parse table data' } }
  } catch (error) {
  const err = error instanceof Error ? error : new Error(String(error))
  return { metadata: { extractionError: err.message } }
  }
}

// Helper functions
function isReceipt(text: string): boolean {
  const receiptIndicators = ['total', 'subtotal', 'receipt', 'invoice', 'paid', 'purchase', 'store', 'shop']
  return receiptIndicators.some(indicator => text.includes(indicator))
}

function isFinancialDocument(text: string): boolean {
  const docIndicators = ['statement', 'balance', 'account', 'transaction', 'bank', 'credit', 'debit']
  return docIndicators.some(indicator => text.includes(indicator))
}

function isChart(text: string): boolean {
  const chartIndicators = ['chart', 'graph', 'axis', 'plot', 'data', 'series']
  return chartIndicators.some(indicator => text.includes(indicator))
}

function isTable(text: string): boolean {
  // Look for table-like structures
  const lines = text.split('\n')
  const hasColumns = lines.some(line => line.includes('\t') || line.match(/\s{3,}/))
  const hasMultipleRows = lines.length > 3
  return hasColumns && hasMultipleRows
}

function isHandwriting(text: string): boolean {
  // This is harder to detect from extracted text
  // Would need to analyze the original image processing confidence
  return text.includes('handwritten') || text.includes('written') || text.includes('note')
}

function estimateExtractionConfidence(text: string): number {
  let confidence = 0.5 // Base confidence

  // Higher confidence for longer, more structured text
  if (text.length > 100) confidence += 0.2
  if (text.length > 500) confidence += 0.1

  // Higher confidence if it contains structured data patterns
  if (text.match(/\d+[\.,]\d{2}/)) confidence += 0.1 // Currency amounts
  if (text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)) confidence += 0.1 // Dates
  if (text.includes('total') || text.includes('amount')) confidence += 0.1

  // Lower confidence for error indicators
  if (text.includes('unclear') || text.includes('hard to read')) confidence -= 0.3
  if (text.includes('error') || text.includes('failed')) confidence -= 0.5

  return Math.max(0, Math.min(1, confidence))
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function arrayBufferToBase64(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  return `data:${mimeType};base64,${base64}`
}

function extractJSON(text: string): any {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1) return null
  const jsonStr = text.slice(first, last + 1)
  try {
    return JSON.parse(jsonStr)
  } catch (err) {
    return null
  }
}

interface InputInfo {
  type: 'text' | 'url' | 'base64' | 'file' | 'buffer' | 'unknown'
  format: string
  mimeType: string
  fileName?: string
}

// Utility functions for external use
export function isSupportedImageFormat(mimeType: string): boolean {
  const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  return supportedTypes.includes(mimeType.toLowerCase())
}

export function getProcessingTimeMessage(processingTime: number): string {
  if (processingTime < 1000) return 'Processed instantly'
  if (processingTime < 5000) return 'Processed quickly'
  if (processingTime < 10000) return 'Processing completed'
  return 'Processing took longer than expected'
}

// Generate summary of extraction results
export function generateExtractionSummary(result: MultiModalResult): string {
  const { contentType, confidence, extractedData, processingTime } = result
  
  let summary = `Detected ${contentType} with ${Math.round(confidence * 100)}% confidence. `
  
  if (extractedData) {
    if (contentType === 'receipt' && extractedData.total) {
      summary += `Found receipt for ${extractedData.currency || '$'}${extractedData.total}`
      if (extractedData.merchant) summary += ` from ${extractedData.merchant}`
    } else if (contentType === 'document' && extractedData.transactions) {
      summary += `Extracted ${extractedData.transactions.length} transactions`
    } else if (extractedData.data) {
      summary += `Extracted ${extractedData.data.length} data points`
    }
  }
  
  summary += `. ${getProcessingTimeMessage(processingTime)}.`
  
  return summary
}
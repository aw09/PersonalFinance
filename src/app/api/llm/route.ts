import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

export async function POST(request: NextRequest) {
  // Get the authorization header
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  
  // Create Supabase client with the user's session token
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  )

  // Verify the user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { message, type = 'transaction_parsing' } = body

    if (!message) {
      return NextResponse.json({ 
        error: 'Message is required' 
      }, { status: 400 })
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ 
        error: 'LLM service not configured',
        suggestion: 'OpenAI API key not found. Please configure OPENAI_API_KEY environment variable.'
      }, { status: 501 })
    }

    // Get user's wallets and categories for context
    const [walletsResponse, categoriesResponse] = await Promise.all([
      supabase
        .from('wallets')
        .select('id, name, currency')
        .eq('owner_id', user.id),
      supabase
        .from('categories')
        .select('id, name, type')
        .eq('user_id', user.id)
    ])

    const wallets = walletsResponse.data || []
    const categories = categoriesResponse.data || []

    let llmResponse: any = {}

    if (type === 'transaction_parsing') {
      // Parse transaction from natural language
      llmResponse = await parseTransactionWithLLM(message, wallets, categories)
    } else if (type === 'financial_advice') {
      // Provide financial insights
      llmResponse = await getFinancialAdviceWithLLM(message, user.id, supabase)
    } else if (type === 'receipt_processing') {
      // Process receipt data
      llmResponse = await processReceiptWithLLM(message)
    } else {
      return NextResponse.json({ 
        error: 'Invalid type. Supported types: transaction_parsing, financial_advice, receipt_processing' 
      }, { status: 400 })
    }

    return NextResponse.json({ response: llmResponse })
  } catch (error) {
    console.error('LLM processing error:', error)
    return NextResponse.json({ 
      error: 'Failed to process with LLM',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function parseTransactionWithLLM(message: string, wallets: any[], categories: any[]) {
  // Simulate LLM parsing response (would integrate with OpenAI API)
  // This is a basic structure that would be replaced with actual LLM integration
  
  const prompt = `
Parse the following message into a structured transaction:
"${message}"

Available wallets: ${wallets.map(w => `${w.name} (${w.currency})`).join(', ')}
Available categories: ${categories.map(c => `${c.name} (${c.type})`).join(', ')}

Return a JSON object with: amount, description, type (income/expense), suggested_category, suggested_wallet
`

  // This would be replaced with actual OpenAI API call
  // For now, return a simulated response
  const suggestion = {
    parsed: true,
    confidence: 0.85,
    transaction: {
      amount: extractAmountFromMessage(message),
      description: extractDescriptionFromMessage(message),
      type: inferTypeFromMessage(message),
      suggested_category: suggestCategory(message, categories),
      suggested_wallet: wallets.length > 0 ? wallets[0].id : null
    },
    alternatives: [],
    requires_clarification: false
  }

  return suggestion
}

async function getFinancialAdviceWithLLM(message: string, userId: string, supabase: any) {
  // This would integrate with OpenAI to provide financial insights
  return {
    advice: "This feature requires OpenAI API configuration. Please set up OPENAI_API_KEY to enable AI-powered financial advice.",
    type: "setup_required",
    suggestions: [
      "Track your spending patterns",
      "Set up budgets for major categories",
      "Review your financial goals regularly"
    ]
  }
}

async function processReceiptWithLLM(receiptData: string) {
  // This would use OpenAI Vision API to process receipt images
  return {
    processed: false,
    message: "Receipt processing requires OpenAI Vision API configuration.",
    items: [],
    total: 0,
    confidence: 0
  }
}

// Helper functions for basic text parsing (fallback when LLM is not available)
function extractAmountFromMessage(message: string): number | null {
  const amountRegex = /\$?(\d+\.?\d*)/
  const match = message.match(amountRegex)
  return match ? parseFloat(match[1]) : null
}

function extractDescriptionFromMessage(message: string): string {
  // Remove common patterns and return cleaned description
  return message
    .replace(/\$?\d+\.?\d*/g, '')
    .replace(/\b(spent|paid|bought|purchased|earned|received)\b/gi, '')
    .trim()
}

function inferTypeFromMessage(message: string): 'income' | 'expense' {
  const incomeKeywords = ['earned', 'received', 'salary', 'income', 'profit', 'bonus']
  const expenseKeywords = ['spent', 'paid', 'bought', 'purchased', 'cost']
  
  const lowerMessage = message.toLowerCase()
  
  if (incomeKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'income'
  }
  
  return 'expense' // Default to expense
}

function suggestCategory(message: string, categories: any[]): string | null {
  const lowerMessage = message.toLowerCase()
  
  // Simple keyword matching for categories
  const categoryKeywords: Record<string, string[]> = {
    'food': ['food', 'restaurant', 'lunch', 'dinner', 'breakfast', 'grocery'],
    'transportation': ['gas', 'fuel', 'uber', 'taxi', 'bus', 'train'],
    'shopping': ['shopping', 'clothes', 'amazon', 'store'],
    'entertainment': ['movie', 'game', 'concert', 'entertainment'],
    'bills': ['bill', 'utility', 'rent', 'insurance'],
    'healthcare': ['doctor', 'pharmacy', 'medical', 'health']
  }
  
  for (const category of categories) {
    const categoryName = category.name.toLowerCase()
    const keywords = categoryKeywords[categoryName] || [categoryName]
    
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return category.id
    }
  }
  
  return null
}
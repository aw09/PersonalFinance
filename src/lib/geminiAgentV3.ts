// Enhanced Gemini Agent V3 with Integrated Specialized Agents
// Integrates all specialized agents for comprehensive query processing

import { orchestrateQuery, orchestrateTextQuery, OrchestrationRequest } from './agentOrchestrator'
import { getTelegramUser } from './telegramAuth'
import {
  getTelegramUserWallets,
  getTelegramUserTransactions,
  getTelegramUserBudgets,
  getTelegramUserCategories
} from './telegramCrud'

// Rate limiting (same as previous versions)
const userBuckets: Map<number, { count: number; windowStart: number }> = new Map()
let globalBucket = { count: 0, windowStart: Date.now() }

const GEMINI_USER_RPM = parseInt(process.env.GEMINI_USER_RPM || '20', 10)
const GEMINI_GLOBAL_RPM = parseInt(process.env.GEMINI_GLOBAL_RPM || '200', 10)

function isRateLimited(telegramUserId: number): boolean {
  const now = Date.now()
  const minute = 60 * 1000

  if (now - globalBucket.windowStart > minute) {
    globalBucket = { count: 0, windowStart: now }
  }

  if (globalBucket.count >= GEMINI_GLOBAL_RPM) return true

  const userBucket = userBuckets.get(telegramUserId) || { count: 0, windowStart: now }
  if (now - userBucket.windowStart > minute) {
    userBucket.count = 0
    userBucket.windowStart = now
  }

  if (userBucket.count >= GEMINI_USER_RPM) return true

  userBucket.count += 1
  userBuckets.set(telegramUserId, userBucket)
  globalBucket.count += 1

  return false
}

// Main enhanced query handler with full agent integration
export async function handleAdvancedTelegramQuery(
  telegramUserId: number,
  telegramChatId: number,
  userMessage: string | File | ArrayBuffer,
  options: {
    includeConfidence?: boolean
    enableRAG?: boolean
    securityLevel?: 'low' | 'medium' | 'high'
    maxRetries?: number
  } = {}
): Promise<string> {
  const {
    includeConfidence = false,
    enableRAG = true,
    securityLevel = 'medium',
    maxRetries = 2
  } = options

  // Rate limiting check
  if (isRateLimited(telegramUserId)) {
    return '⏱️ You\'re sending messages too quickly. Please wait a moment and try again.'
  }

  try {
    // Get user context
    const user = await getTelegramUser(telegramUserId)
    if (!user) {
      return '❌ Your account isn\'t linked yet. Please link your account first using /link'
    }

    // Build user context
    const [wallets, transactions, budgets, categories] = await Promise.all([
      getTelegramUserWallets(telegramUserId),
      getTelegramUserTransactions(telegramUserId, undefined, 5),
      getTelegramUserBudgets(telegramUserId),
      getTelegramUserCategories(telegramUserId)
    ])

    const context = {
      hasWallets: wallets && wallets.length > 0,
      hasTransactions: transactions && transactions.length > 0,
      hasBudgets: budgets && budgets.length > 0,
      hasCategories: categories && categories.length > 0,
      defaultCurrency: wallets?.[0]?.currency || 'USD',
      experienceLevel: 'intermediate' as const, // Could be determined from user history
      conversationHistory: [] // Could store recent conversation history
    }

    // Create orchestration request
    const request: OrchestrationRequest = {
      userInput: userMessage,
      userId: user.id,
      telegramUserId,
      context,
      options: {
        includeConfidence,
        enableRAG,
        securityLevel,
        maxTools: 3
      }
    }

    // Use the orchestrator for comprehensive processing
    const result = await orchestrateQuery(request)

    // Format response with optional confidence and processing info
    let response = result.finalResponse

    if (includeConfidence && result.confidence) {
      response += `\n\n📊 Confidence: ${result.confidence.overall}% - ${result.confidence.reasoning}`
    }

    // Add processing summary for debug mode or advanced users
    if (process.env.NODE_ENV === 'development') {
      const summary = `\n\n🔧 Processed in ${result.processing.totalTime}ms using: ${result.processing.stepsExecuted.join(' → ')}`
      response += summary
    }

    return response

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Advanced Telegram query error:', {
      telegramUserId,
      error: err.message,
      stack: err.stack
    })

    return '❌ I encountered an error processing your request. Please try again in a moment.'
  }
}

// Simplified text-only handler for backward compatibility
export async function handleEnhancedTelegramTextQuery(
  telegramUserId: number,
  telegramChatId: number,
  userMessage: string,
  options: {
    includeConfidence?: boolean
    enableRAG?: boolean
  } = {}
): Promise<string> {
  // Rate limiting check
  if (isRateLimited(telegramUserId)) {
    return '⏱️ You\'re sending messages too quickly. Please wait a moment and try again.'
  }

  try {
    // Get user context
    const user = await getTelegramUser(telegramUserId)
    if (!user) {
      return '❌ Your account isn\'t linked yet. Please link your account first using /link'
    }

    // Build simplified context
    const [wallets, transactions, budgets] = await Promise.all([
      getTelegramUserWallets(telegramUserId),
      getTelegramUserTransactions(telegramUserId, undefined, 5),
      getTelegramUserBudgets(telegramUserId)
    ])

    const context = {
      hasWallets: wallets && wallets.length > 0,
      hasTransactions: transactions && transactions.length > 0,
      hasBudgets: budgets && budgets.length > 0,
      hasCategories: false,
      defaultCurrency: wallets?.[0]?.currency || 'USD'
    }

    // Use simplified orchestration
    const response = await orchestrateTextQuery(
      userMessage,
      user.id,
      context,
      {
        includeConfidence: options.includeConfidence,
        enableRAG: options.enableRAG,
        securityLevel: 'medium'
      }
    )

    return response

  } catch (error) {
    console.error('Enhanced text query error:', error)
    return '❌ I encountered an error processing your request. Please try again.'
  }
}

// Specialized handler for receipt/image processing
export async function handleReceiptProcessing(
  telegramUserId: number,
  imageData: File | ArrayBuffer,
  options: {
    autoCreateTransaction?: boolean
    requestConfirmation?: boolean
  } = {}
): Promise<string> {
  const { autoCreateTransaction = true, requestConfirmation = true } = options

  try {
    // Get user context
    const user = await getTelegramUser(telegramUserId)
    if (!user) {
      return '❌ Your account isn\'t linked yet. Please link your account first using /link'
    }

    const wallets = await getTelegramUserWallets(telegramUserId)
    
    const context = {
      hasWallets: wallets && wallets.length > 0,
      hasTransactions: true,
      hasBudgets: false,
      hasCategories: false,
      defaultCurrency: wallets?.[0]?.currency || 'USD'
    }

    if (!context.hasWallets) {
      return '💳 You need to create a wallet first before I can process receipts. Use the command "create wallet" to get started.'
    }

    // Create orchestration request for multimodal processing
    const request: OrchestrationRequest = {
      userInput: imageData,
      userId: user.id,
      telegramUserId,
      context,
      options: {
        includeConfidence: true,
        enableRAG: false, // Not needed for receipt processing
        securityLevel: 'low', // Images are generally safe
        maxTools: 2 // Usually just need wallet info and add transaction
      }
    }

    const result = await orchestrateQuery(request)

    // Format response for receipt processing
    let response = result.finalResponse

    if (result.rawData?.structuredData) {
      const data = result.rawData.structuredData
      response += '\n\n📄 **Receipt Details:**'
      
      if (data.merchant) response += `\n🏪 Merchant: ${data.merchant}`
      if (data.date) response += `\n📅 Date: ${data.date}`
      if (data.total) response += `\n💰 Total: ${data.currency || '$'}${data.total}`
      
      if (data.items && data.items.length > 0) {
        response += '\n\n🛒 **Items:**'
        data.items.slice(0, 3).forEach((item: any) => {
          response += `\n• ${item.description}${item.price ? ` - $${item.price}` : ''}`
        })
        if (data.items.length > 3) {
          response += `\n• ... and ${data.items.length - 3} more items`
        }
      }

      if (requestConfirmation && autoCreateTransaction) {
        response += '\n\n✅ Transaction has been automatically created from this receipt. You can view it in your transaction history.'
      }
    }

    return response

  } catch (error) {
    console.error('Receipt processing error:', error)
    return '❌ I had trouble processing your receipt. Please try uploading a clearer image or enter the transaction manually.'
  }
}

// Health check for the integrated system
export async function performSystemHealthCheck(): Promise<string> {
  try {
    const { performAgentHealthCheck } = await import('./agentOrchestrator')
    const healthCheck = await performAgentHealthCheck()
    
    let response = `🏥 **System Health Check**\n\nOverall Status: ${getStatusEmoji(healthCheck.status)} ${healthCheck.status.toUpperCase()}\n\n**Agent Status:**`
    
    for (const [agentName, isHealthy] of Object.entries(healthCheck.agents)) {
      response += `\n${isHealthy ? '✅' : '❌'} ${formatAgentName(agentName)}`
    }
    
    if (healthCheck.details.length > 0) {
      response += '\n\n**Issues:**'
      healthCheck.details.forEach(detail => {
        response += `\n⚠️ ${detail}`
      })
    }
    
    return response
    
  } catch (error) {
  const err = error instanceof Error ? error : new Error(String(error))
  return `❌ Health check failed: ${err.message}`
  }
}

// Helper functions
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'healthy': return '🟢'
    case 'degraded': return '🟡'
    case 'unhealthy': return '🔴'
    default: return '⚪'
  }
}

function formatAgentName(agentName: string): string {
  const names: Record<string, string> = {
    promptInjection: 'Security Agent',
    toolsSelection: 'Tools Agent',
    rag: 'Knowledge Agent',
    multiModal: 'Image Processing Agent',
    confidence: 'Quality Agent'
  }
  return names[agentName] || agentName
}

// General help with agent capabilities
export function getAgentCapabilitiesHelp(): string {
  return `🤖 **Enhanced AI Assistant Capabilities**

I now use specialized agents to provide better assistance:

🛡️ **Security Agent**
• Protects against malicious inputs
• Ensures safe processing of your queries

🧠 **Knowledge Agent**
• Enhanced with financial expertise
• Provides context-aware advice and tips

🔧 **Tools Agent**
• Intelligently selects the right tools
• Can use multiple tools for complex requests

🖼️ **Image Processing Agent**
• Process receipt images automatically
• Extract transaction details from photos
• Convert documents to structured data

📊 **Quality Agent**
• Evaluates response accuracy
• Provides confidence scores
• Suggests improvements

**New Features:**
• Upload receipt photos to auto-create transactions
• Ask complex financial questions with knowledge enhancement
• Get confidence scores on responses (use /confidence command)
• Enhanced security for all interactions

Try saying:
• "Upload a receipt" (then send an image)
• "Give me budgeting advice with confidence score"
• "Analyze my spending patterns using multiple data sources"
• "/health" to check system status`
}

// Backward compatibility - delegates to the appropriate enhanced function
export async function handleGeminiTelegramQuery(
  telegramUserId: number,
  telegramChatId: number,
  userMessage: string
): Promise<string> {
  return await handleEnhancedTelegramTextQuery(telegramUserId, telegramChatId, userMessage, {
    includeConfidence: false,
    enableRAG: true
  })
}
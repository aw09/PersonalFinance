// Enhanced Gemini Agent with Separated Prompt and Tool Systems
// Version 2 with confidence scoring and better architecture

import { generateGeminiReply, GeminiResponse } from './gemini'
import { logLLMUsage, createConversationSession } from './llmLogger'
import { calculateConfidenceScore, formatConfidenceScore, ResponseContext } from './confidenceAgent'
import { buildSystemPrompt, buildUserPrompt, buildIntentAnalysisPrompt, PromptContext } from './promptSystem'
import { FINANCIAL_TOOLS, findTool, validateToolArguments, ToolCall, ToolResult } from './aiTools'
import { getTelegramUser } from './telegramAuth'
import {
  createTelegramUserTransaction,
  getTelegramUserTransactions,
  getTelegramUserWallets,
  createTelegramUserWallet,
  updateTelegramUserWallet,
  getTelegramUserCategories,
  createTelegramUserCategory,
  getTelegramUserBudgets,
  createTelegramUserBudget
} from './telegramCrud'

// Rate limiting (same as original)
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

// Main enhanced query handler
export async function handleEnhancedTelegramQuery(
  telegramUserId: number,
  telegramChatId: number,
  userMessage: string,
  options: {
    includeConfidence?: boolean
    maxRetries?: number
  } = {}
): Promise<string> {
  const startTime = Date.now()
  const { includeConfidence = false, maxRetries = 2 } = options

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

    // Build user profile for context
    const [wallets, transactions, budgets] = await Promise.all([
      getTelegramUserWallets(telegramUserId),
      getTelegramUserTransactions(telegramUserId, undefined, 5),
      getTelegramUserBudgets(telegramUserId)
    ])

    const userProfile = {
      hasWallets: wallets && wallets.length > 0,
      hasTransactions: transactions && transactions.length > 0,
      hasBudgets: budgets && budgets.length > 0,
      defaultCurrency: wallets?.[0]?.currency || 'USD'
    }

    // Step 1: Analyze intent with separated prompt
    const intentAnalysis = await analyzeIntent(userMessage, user.id)
    
    // Step 2: Execute tools if needed
    const toolResults = await executeRequiredTools(intentAnalysis, telegramUserId)
    
    // Step 3: Generate final response
    const finalResponse = await generateFinalResponse(
      userMessage,
      intentAnalysis,
      toolResults,
      userProfile,
      user.id
    )

    // Step 4: Calculate confidence if requested
    let confidenceInfo = ''
    if (includeConfidence) {
      const responseContext: ResponseContext = {
        userQuery: userMessage,
        aiResponse: finalResponse,
        toolsUsed: toolResults.map(r => r.toolName),
        dataRetrieved: toolResults.map(r => r.result.data).filter(Boolean),
        executionTime: Date.now() - startTime,
        hasErrors: toolResults.some(r => !r.result.success)
      }

      const confidence = await calculateConfidenceScore(responseContext, user.id)
      confidenceInfo = `\n\n${formatConfidenceScore(confidence)}`
    }

    // Log the interaction
    await logLLMUsage({
      userId: user.id,
      telegramUserId: telegramUserId,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: userMessage,
      response: finalResponse,
      status: 'success',
      intentDetected: intentAnalysis.intent,
      metadata: {
        tools_used: toolResults.map(r => r.toolName),
        confidence_score: includeConfidence ? 
          (await calculateConfidenceScore({
            userQuery: userMessage,
            aiResponse: finalResponse,
            toolsUsed: toolResults.map(r => r.toolName),
            dataRetrieved: toolResults.map(r => r.result.data).filter(Boolean),
            executionTime: Date.now() - startTime,
            hasErrors: toolResults.some(r => !r.result.success)
          }, user.id)).overall : undefined
      }
    })

    return finalResponse + confidenceInfo

  } catch (error) {
    console.error('Enhanced Telegram query error:', error)
    return '❌ I encountered an error processing your request. Please try again in a moment.'
  }
}

// Step 1: Intent Analysis with separated prompts
async function analyzeIntent(userMessage: string, userId: string): Promise<{
  intent: string
  confidence: number
  parameters: Record<string, any>
  needsClarification: boolean
  clarificationQuestion?: string
}> {
  const intentPrompt = buildIntentAnalysisPrompt(userMessage)
  
  try {
    const response = await generateGeminiReply(intentPrompt, {
      userId,
      intent: 'intent_analysis'
    })

    const analysis = extractJSON(response.text)
    if (!analysis) {
      return {
        intent: 'general_question',
        confidence: 0.5,
        parameters: {},
        needsClarification: false
      }
    }

    return {
      intent: analysis.intent || 'general_question',
      confidence: analysis.confidence || 0.5,
      parameters: analysis.parameters || {},
      needsClarification: analysis.needs_clarification || false,
      clarificationQuestion: analysis.clarification_question
    }
  } catch (error) {
    console.error('Intent analysis error:', error)
    return {
      intent: 'general_question',
      confidence: 0.3,
      parameters: {},
      needsClarification: false
    }
  }
}

// Step 2: Tool Execution (separated from prompts)
async function executeRequiredTools(
  intentAnalysis: any,
  telegramUserId: number
): Promise<Array<{ toolName: string; result: ToolResult }>> {
  const { intent, parameters } = intentAnalysis
  const results: Array<{ toolName: string; result: ToolResult }> = []

  try {
    switch (intent) {
      case 'add_transaction':
        const transactionResult = await executeAddTransaction(parameters, telegramUserId)
        results.push({ toolName: 'add_transaction', result: transactionResult })
        break

      case 'create_wallet':
        const walletResult = await executeCreateWallet(parameters, telegramUserId)
        results.push({ toolName: 'create_wallet', result: walletResult })
        break

      case 'update_wallet':
        const updateResult = await executeUpdateWallet(parameters, telegramUserId)
        results.push({ toolName: 'update_wallet', result: updateResult })
        break

      case 'get_transactions':
        const getTransactionsResult = await executeGetTransactions(parameters, telegramUserId)
        results.push({ toolName: 'get_transactions', result: getTransactionsResult })
        break

      case 'get_wallets':
        const getWalletsResult = await executeGetWallets(telegramUserId)
        results.push({ toolName: 'get_wallets', result: getWalletsResult })
        break

      case 'create_budget':
        const budgetResult = await executeCreateBudget(parameters, telegramUserId)
        results.push({ toolName: 'create_budget', result: budgetResult })
        break

      case 'get_budgets':
        const getBudgetsResult = await executeGetBudgets(telegramUserId)
        results.push({ toolName: 'get_budgets', result: getBudgetsResult })
        break

      // Add more tool executions as needed
    }
  } catch (error) {
    console.error('Tool execution error:', error)
    results.push({
      toolName: intent,
      result: { success: false, error: 'Tool execution failed' }
    })
  }

  return results
}

// Step 3: Final Response Generation
async function generateFinalResponse(
  userMessage: string,
  intentAnalysis: any,
  toolResults: Array<{ toolName: string; result: ToolResult }>,
  userProfile: any,
  userId: string
): Promise<string> {
  const context: PromptContext = {
    userMessage,
    userProfile,
    availableTools: FINANCIAL_TOOLS.map(t => t.name)
  }

  const systemPrompt = buildSystemPrompt(context)
  const userPrompt = buildUserPrompt(context)

  // Include tool results in the prompt
  const toolResultsText = toolResults.map(tr => 
    `Tool: ${tr.toolName}\nResult: ${JSON.stringify(tr.result, null, 2)}`
  ).join('\n\n')

  const fullPrompt = `${systemPrompt.content}

User Request: ${userPrompt}

Tool Results:
${toolResultsText}

Generate a helpful, friendly response that acknowledges what was done and provides relevant financial advice.`

  try {
    const response = await generateGeminiReply(fullPrompt, {
      userId,
      intent: 'final_response'
    })

    return response.text
  } catch (error) {
    console.error('Final response generation error:', error)
    return '❌ I had trouble generating a response. Please try rephrasing your request.'
  }
}

// Tool execution functions with proper descriptions
async function executeAddTransaction(params: any, telegramUserId: number): Promise<ToolResult> {
  try {
    const wallets = await getTelegramUserWallets(telegramUserId)
    if (!wallets || wallets.length === 0) {
      return { success: false, error: 'No wallets found. Please create a wallet first.' }
    }

    const targetWallet = params.wallet_name 
      ? wallets.find(w => w.name.toLowerCase().includes(params.wallet_name.toLowerCase()))
      : wallets[0]

    if (!targetWallet) {
      return { success: false, error: `Wallet "${params.wallet_name}" not found.` }
    }

    const transaction = await createTelegramUserTransaction(
      telegramUserId,
      targetWallet.id,
      params.amount,
      params.description,
      params.type,
      undefined // categoryId
    )

    return { 
      success: true, 
      data: transaction,
      message: `Added ${params.type} of ${params.amount} ${targetWallet.currency} for ${params.description}`
    }
  } catch (error) {
    return { success: false, error: 'Failed to add transaction' }
  }
}

async function executeCreateWallet(params: any, telegramUserId: number): Promise<ToolResult> {
  try {
    const wallet = await createTelegramUserWallet(
      telegramUserId, 
      params.name,
      undefined, // description is optional
      params.currency
    )

    return {
      success: true,
      data: wallet,
      message: `Created wallet "${params.name}" with currency ${params.currency}`
    }
  } catch (error) {
    return { success: false, error: 'Failed to create wallet' }
  }
}

async function executeUpdateWallet(params: any, telegramUserId: number): Promise<ToolResult> {
  try {
    const wallets = await getTelegramUserWallets(telegramUserId)
    const targetWallet = wallets?.find(w => 
      w.name.toLowerCase() === params.current_name.toLowerCase()
    )

    if (!targetWallet) {
      return { success: false, error: `Wallet "${params.current_name}" not found` }
    }

    const updates: { name?: string; description?: string; currency?: string } = {}
    if (params.new_name) updates.name = params.new_name
    if (params.new_currency) updates.currency = params.new_currency

    const updatedWallet = await updateTelegramUserWallet(
      telegramUserId, 
      targetWallet.id, 
      updates
    )

    return {
      success: true,
      data: updatedWallet,
      message: `Updated wallet "${params.current_name}"`
    }
  } catch (error) {
    return { success: false, error: 'Failed to update wallet' }
  }
}

async function executeGetTransactions(params: any, telegramUserId: number): Promise<ToolResult> {
  try {
    // Check if wallet_name is provided to filter transactions
    let walletId: string | undefined = undefined;
    
    if (params.wallet_name) {
      const wallets = await getTelegramUserWallets(telegramUserId);
      const targetWallet = wallets?.find(w => 
        w.name.toLowerCase().includes(params.wallet_name.toLowerCase())
      );
      if (targetWallet) {
        walletId = targetWallet.id;
      }
    }
    
    const transactions = await getTelegramUserTransactions(
      telegramUserId, 
      walletId,
      params.limit || 10
    );

    return {
      success: true,
      data: transactions,
      message: `Retrieved ${transactions?.length || 0} transactions`
    }
  } catch (error) {
    return { success: false, error: 'Failed to retrieve transactions' }
  }
}

async function executeGetWallets(telegramUserId: number): Promise<ToolResult> {
  try {
    const wallets = await getTelegramUserWallets(telegramUserId)
    
    return {
      success: true,
      data: wallets,
      message: `Retrieved ${wallets?.length || 0} wallets`
    }
  } catch (error) {
    return { success: false, error: 'Failed to retrieve wallets' }
  }
}

async function executeCreateBudget(params: any, telegramUserId: number): Promise<ToolResult> {
  try {
    // We need to get the default wallet ID if not specified
    const wallets = await getTelegramUserWallets(telegramUserId);
    if (!wallets || wallets.length === 0) {
      return { success: false, error: 'No wallets found. Please create a wallet first.' };
    }
    
    // Use the first wallet by default or find a specific one if wallet_name is provided
    const targetWallet = params.wallet_name 
      ? wallets.find(w => w.name.toLowerCase().includes(params.wallet_name.toLowerCase()))
      : wallets[0];
    
    if (!targetWallet) {
      return { success: false, error: `Wallet "${params.wallet_name}" not found.` };
    }
    
    // Find or create a category if needed
    let categoryId: string | undefined = undefined;
    if (params.category) {
      const categories = await getTelegramUserCategories(telegramUserId);
      const existingCategory = categories.find(c => 
        c.name.toLowerCase() === params.category.toLowerCase()
      );
      
      if (existingCategory) {
        categoryId = existingCategory.id;
      }
    }
    
    const budget = await createTelegramUserBudget(
      telegramUserId,
      targetWallet.id,
      params.name,
      params.amount,
      params.period || 'monthly',
      categoryId
    );

    return {
      success: true,
      data: budget,
      message: `Created ${params.period} budget "${params.name}" for ${params.amount}`
    }
  } catch (error) {
    return { success: false, error: 'Failed to create budget' }
  }
}

async function executeGetBudgets(telegramUserId: number): Promise<ToolResult> {
  try {
    const budgets = await getTelegramUserBudgets(telegramUserId)
    
    return {
      success: true,
      data: budgets,
      message: `Retrieved ${budgets?.length || 0} budgets`
    }
  } catch (error) {
    return { success: false, error: 'Failed to retrieve budgets' }
  }
}

// Helper function to extract JSON from LLM response
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
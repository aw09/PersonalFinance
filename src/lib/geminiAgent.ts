import { generateGeminiReply, GeminiResponse } from './gemini'
import { logLLMUsage, createConversationSession } from './llmLogger'
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

// Simple in-memory rate limiter (MVP). Respects per-user and global RPM limits
const userBuckets: Map<number, { count: number; windowStart: number }> = new Map()
let globalBucket = { count: 0, windowStart: Date.now() }

const GEMINI_USER_RPM = parseInt(process.env.GEMINI_USER_RPM || '20', 10) // requests per minute per user
const GEMINI_GLOBAL_RPM = parseInt(process.env.GEMINI_GLOBAL_RPM || '200', 10) // global requests per minute

function isRateLimited(telegramUserId: number) {
  const now = Date.now()
  const minute = 60 * 1000

  // reset global window
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

  // consume
  userBucket.count += 1
  userBuckets.set(telegramUserId, userBucket)
  globalBucket.count += 1

  return false
}

// Try to parse JSON even when model outputs extra text
function extractJSON(text: string) {
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

type IntentResult = {
  intent: string
  params?: Record<string, any>
  reply?: string
  shouldShowMenu?: boolean
}

// Enhanced general question responses
function getGeneralQuestionResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase()
  
  if (lowerMessage.includes('what can you do') || lowerMessage.includes('help') || lowerMessage.includes('capabilities')) {
    return `🤖 I'm your Personal Finance Assistant! Here's what I can help you with:

💰 **Financial Management:**
• Add income and expense transactions
• Create and manage wallets
• Set up budgets and track spending
• Manage categories for better organization
• Track investments and portfolio

📊 **Information & Reports:**
• View recent transactions
• Check wallet balances
• Generate spending reports
• Monitor budget progress

🔧 **Bot Features:**
• Use natural language (e.g., "Add $50 expense for groceries")
• Ask general questions about personal finance
• Get tips and recommendations
• Link with your web account for sync

💡 **Tips:**
• Try saying "Add transaction 25 dollars for lunch"
• Ask "Show my recent transactions"
• Say "Create a new wallet called Savings"
• Ask "What's my spending this month?"

Use /menu to see quick action buttons, or just talk to me naturally! 🌟`
  }
  
  if (lowerMessage.includes('how') && (lowerMessage.includes('budget') || lowerMessage.includes('save money'))) {
    return `💡 **Smart Budgeting Tips:**

📋 **1. Start with the 50/30/20 Rule:**
• 50% for needs (rent, utilities, groceries)
• 30% for wants (entertainment, dining out)
• 20% for savings and debt payment

📊 **2. Track Everything:**
• Record every expense (I can help with this!)
• Use categories to see spending patterns
• Review weekly and adjust as needed

🎯 **3. Set Realistic Goals:**
• Start small and build habits
• Automate savings if possible
• Create separate wallets for different goals

💪 **4. Stay Consistent:**
• Check your budget weekly
• Adjust categories based on real spending
• Celebrate small wins!

Want me to help you create a budget? Just say "Create a budget for [category]" and I'll guide you through it! 💪`
  }
  
  if (lowerMessage.includes('invest') || lowerMessage.includes('stock') || lowerMessage.includes('crypto')) {
    return `📈 **Investment Basics:**

⚠️ **Important:** I can track your investments, but this isn't financial advice!

🎯 **Getting Started:**
• Start with an emergency fund (3-6 months expenses)
• Only invest money you won't need for 5+ years
• Consider low-cost index funds for beginners
• Diversify across different asset types

📊 **I can help you:**
• Track your investment portfolio
• Record purchase prices and current values
• Monitor gains/losses over time
• Organize investments by type

💡 **Pro Tips:**
• Dollar-cost averaging reduces risk
• Don't panic during market downturns
• Rebalance your portfolio regularly
• Keep learning about investing

Want to add an investment to track? Say "Add investment [name] worth $[amount]" and I'll help you set it up! 🚀`
  }
  
  if (lowerMessage.includes('debt') || lowerMessage.includes('loan') || lowerMessage.includes('credit card')) {
    return `💳 **Debt Management Strategies:**

🎯 **Debt Payoff Methods:**
• **Snowball:** Pay minimums, then attack smallest debt first
• **Avalanche:** Pay minimums, then attack highest interest rate first
• **Hybrid:** Mix both approaches based on motivation

📋 **Action Steps:**
1. List all debts with balances and interest rates
2. Make minimum payments on everything
3. Put extra money toward your chosen target
4. Track progress to stay motivated

💡 **I can help you:**
• Track loan balances and payments
• Set up payment reminders
• Monitor progress toward debt freedom
• Calculate payoff timelines

🚫 **Avoid:**
• Only making minimum payments
• Taking on new debt while paying off old
• Ignoring the debt and hoping it goes away

Want to track a loan or debt? Say "Add loan [name] amount $[balance]" and I'll help you monitor it! 💪`
  }
  
  return `🤖 I'm here to help with your personal finances! I can answer questions about budgeting, saving, investing, and debt management. I can also help you track transactions, manage wallets, and organize your financial life.

Try asking me:
• "What can you do?"
• "How do I create a budget?"
• "Add a $50 expense for groceries"
• "Show my recent transactions"

Use /menu for quick actions, or just talk to me naturally! 💰`
}

export async function handleGeminiTelegramQuery(
  telegramUserId: number,
  telegramChatId: number,
  userMessage: string
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return 'LLM not configured.'
  }

  if (isRateLimited(telegramUserId)) {
    return '⚠️ You are making requests too quickly. Please wait a moment and try again.'
  }

  // Get user info for logging
  const telegramUser = await getTelegramUser(telegramUserId)
  const userId = telegramUser?.user_id

  // Create session for this conversation
  const sessionId = await createConversationSession({
    userId,
    telegramUserId,
    sessionType: 'telegram',
    context: { chatId: telegramChatId }
  })

  // Check if this is a general question first
  const lowerMessage = userMessage.toLowerCase()
  const generalQuestionKeywords = [
    'what can you do', 'help', 'capabilities', 'how to', 'tips', 'advice',
    'budget', 'save money', 'invest', 'stock', 'crypto', 'debt', 'loan'
  ]
  
  const isGeneralQuestion = generalQuestionKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  ) && !lowerMessage.includes('add') && !lowerMessage.includes('create') && 
     !lowerMessage.includes('list') && !lowerMessage.includes('show')

  if (isGeneralQuestion) {
    const response = getGeneralQuestionResponse(userMessage)
    
    // Log this as a general question
    await logLLMUsage({
      userId,
      telegramUserId,
      provider: 'built-in',
      model: 'general-qa',
      prompt: userMessage,
      response,
      status: 'success',
      sessionId: sessionId || undefined,
      intentDetected: 'general_question',
      actionTaken: 'provided_general_info'
    })
    
    return response
  }

  // For transaction-related queries, use the LLM for intent detection
  const system = `You are a personal finance assistant for a Telegram bot. When given a user's message, output a JSON object with keys:
- intent: one of [create_transaction, list_transactions, create_wallet, list_wallets, update_wallet, create_category, list_categories, create_budget, list_budgets, generate_report, general_question, unknown]
- params: object with typed parameters required for the intent (e.g. amount, description, wallet_name, wallet_id, new_wallet_name, new_currency, category_name, period)
- reply: a short human-friendly message that the bot can send immediately
- shouldShowMenu: boolean (true if user should see menu options, false for informational responses)

For financial actions (create/list/update), set shouldShowMenu to false since the user has a specific task.
For general questions or unknown intents, set shouldShowMenu to true to guide the user.

For update_wallet intent, expect params like: wallet_name (current name) or wallet_id, new_wallet_name (optional), new_currency (optional).

Only output valid JSON. If you cannot map intent, use intent: "unknown" and provide reply with a helpful suggestion.`

  const userPrompt = `User message: "${userMessage.replace(/"/g, '\\"')}"\nRespond with JSON only.`
  const fullPrompt = system + '\n\n' + userPrompt

  let geminiResponse: GeminiResponse
  try {
    geminiResponse = await generateGeminiReply(fullPrompt, {
      userId,
      telegramUserId,
      sessionId: sessionId || undefined,
      intent: 'intent_detection'
    })
  } catch (error) {
    await logLLMUsage({
      userId,
      telegramUserId,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: fullPrompt,
      response: null,
      status: 'error',
      sessionId: sessionId || undefined,
      intentDetected: 'intent_detection',
      errorMessage: String(error)
    })
    return 'Sorry, I had trouble understanding that. Use /menu to see available options.'
  }

  const parsed = extractJSON(geminiResponse.text)
  let intentObj: IntentResult | null = parsed

  // If parsing failed, try to interpret plain text heuristics
  if (!intentObj) {
    const txt = userMessage.toLowerCase()
    if (txt.includes('add') && txt.includes('transaction')) {
      intentObj = { intent: 'create_transaction', params: {}, reply: 'Okay, I can add a transaction — what is the amount and description?', shouldShowMenu: false }
    } else if (txt.includes('list') && txt.includes('transaction')) {
      intentObj = { intent: 'list_transactions', params: { limit: 10 }, reply: 'Here are your recent transactions:', shouldShowMenu: false }
    } else if (txt.includes('wallet')) {
      intentObj = { intent: 'list_wallets', params: {}, reply: 'Here are your wallets:', shouldShowMenu: false }
    } else {
      intentObj = { intent: 'unknown', reply: geminiResponse.text, shouldShowMenu: true }
    }
  }

  // Execute safe mapped actions
  try {
    let actionTaken = 'none'
    let result = ''

    switch (intentObj.intent) {
      case 'create_transaction': {
        const p = intentObj.params || {}
        const amount = Number(p.amount || p.value || 0)
        const description = p.description || p.desc || 'Added via Telegram'
        const type = p.type === 'income' ? 'income' : 'expense'
        const walletId = p.wallet_id || p.walletId || p.wallet || null

        if (!amount || !walletId) {
          result = intentObj.reply || 'Please provide an amount and wallet to create a transaction.'
        } else {
          const transaction = await createTelegramUserTransaction(
            telegramUserId,
            walletId,
            amount,
            description,
            type as 'income' | 'expense',
            p.category_id || p.categoryId
          )
          actionTaken = 'transaction_created'
          result = intentObj.reply || `✅ Transaction recorded: ${description} — ${amount}`
        }
        break
      }

      case 'list_transactions': {
        const p = intentObj.params || {}
        const limit = Number(p.limit || 10)
        const walletId = p.wallet_id || p.walletId || undefined
        const txs = await getTelegramUserTransactions(telegramUserId, walletId, limit)

        if (!txs || txs.length === 0) {
          result = 'No transactions found.'
        } else {
          let out = '💰 Recent transactions:\n\n'
          txs.forEach((t: any) => {
            out += `${t.type === 'income' ? '💚' : '💸'} ${t.description} — ${t.amount} (${t.wallets?.name || 'wallet'})\n`
          })
          result = out
        }
        actionTaken = 'transactions_listed'
        break
      }

      case 'create_wallet': {
        const p = intentObj.params || {}
        const name = p.name || p.wallet_name || 'New Wallet'
        const currency = p.currency || 'USD'
        const description = p.description || null

        const wallet = await createTelegramUserWallet(telegramUserId, name, description, currency)
        actionTaken = 'wallet_created'
        result = intentObj.reply || `✅ Wallet created: ${wallet.name} (${wallet.currency})`
        break
      }

      case 'list_wallets': {
        const wallets = await getTelegramUserWallets(telegramUserId)
        if (!wallets || wallets.length === 0) {
          result = 'No wallets found.'
        } else {
          let out = '💼 Your wallets:\n\n'
          wallets.forEach((w: any) => { out += `${w.name} — ${w.balance || 0} ${w.currency}\n` })
          result = out
        }
        actionTaken = 'wallets_listed'
        break
      }

      case 'update_wallet': {
        const p = intentObj.params || {}
        const currentName = p.wallet_name || p.current_name
        const newName = p.new_wallet_name || p.new_name
        const newCurrency = p.new_currency
        
        if (!currentName) {
          result = '❌ Please specify which wallet to update.'
          break
        }

        // Get user's wallets to find the one to update
        const wallets = await getTelegramUserWallets(telegramUserId)
        const targetWallet = wallets?.find((w: any) => 
          w.name.toLowerCase() === currentName.toLowerCase()
        )

        if (!targetWallet) {
          result = `❌ Wallet "${currentName}" not found.`
          break
        }

        // Import updateWallet function
        
        try {
          const updates: any = {}
          if (newName) updates.name = newName
          if (newCurrency) updates.currency = newCurrency.toUpperCase()
          
          const updatedWallet = await updateTelegramUserWallet(
            telegramUserId, 
            targetWallet.id, 
            updates
          )
          
          actionTaken = 'wallet_updated'
          result = `✅ Wallet updated successfully!\n${updatedWallet.name} (${updatedWallet.currency})`
        } catch (error) {
          console.error('Error updating wallet:', error)
          result = '❌ Failed to update wallet. Please try again.'
        }
        break
      }

      case 'create_category': {
        const p = intentObj.params || {}
        const name = p.name || 'New Category'
        const type = p.type === 'income' ? 'income' : 'expense'
        const category = await createTelegramUserCategory(telegramUserId, name, type)
        actionTaken = 'category_created'
        result = intentObj.reply || `✅ Category created: ${category.name}`
        break
      }

      case 'list_categories': {
        const cats = await getTelegramUserCategories(telegramUserId)
        if (!cats || cats.length === 0) {
          result = 'No categories found.'
        } else {
          let out = '🏷️ Categories:\n\n'
          cats.forEach((c: any) => out += `${c.name} (${c.type})\n`)
          result = out
        }
        actionTaken = 'categories_listed'
        break
      }

      case 'create_budget': {
        const p = intentObj.params || {}
        const name = p.name || 'Budget'
        const amount = Number(p.amount || 0)
        const period = p.period || 'monthly'
        const walletId = p.wallet_id || p.walletId
        if (!amount || !walletId) {
          result = 'Provide amount and wallet to create a budget.'
        } else {
          const budget = await createTelegramUserBudget(telegramUserId, walletId, name, amount, period, p.category_id)
          actionTaken = 'budget_created'
          result = intentObj.reply || `✅ Budget created: ${budget.name} — ${budget.amount}`
        }
        break
      }

      case 'list_budgets': {
        const budgets = await getTelegramUserBudgets(telegramUserId)
        if (!budgets || budgets.length === 0) {
          result = 'No budgets found.'
        } else {
          let out = '📊 Budgets:\n\n'
          budgets.forEach((b: any) => out += `${b.name} — ${b.amount} (${b.period})\n`)
          result = out
        }
        actionTaken = 'budgets_listed'
        break
      }

      case 'generate_report': {
        const p = intentObj.params || {}
        const limit = Number(p.limit || 100)
        const txs = await getTelegramUserTransactions(telegramUserId, undefined, limit)
        if (!txs || txs.length === 0) {
          result = 'No transactions to report.'
        } else {
          let income = 0
          let expense = 0
          txs.forEach((t: any) => {
            if (t.type === 'income') income += Number(t.amount || 0)
            else expense += Number(t.amount || 0)
          })
          const net = income - expense
          result = `📈 Report (last ${txs.length}):\nIncome: ${income}\nExpense: ${expense}\nNet: ${net}`
        }
        actionTaken = 'report_generated'
        break
      }

      case 'general_question': {
        result = getGeneralQuestionResponse(userMessage)
        actionTaken = 'general_info_provided'
        break
      }

      case 'unknown':
      default:
        result = intentObj.reply || "I couldn't map your request. Try saying 'Add transaction 12.50 for lunch in wallet X' or 'Show me recent transactions'."
        actionTaken = 'unknown_intent'
        break
    }

    // Log the final action
    await logLLMUsage({
      userId,
      telegramUserId,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: userMessage,
      response: result,
      status: 'success',
      sessionId: sessionId || undefined,
      intentDetected: intentObj.intent,
      actionTaken,
      metadata: { 
        shouldShowMenu: intentObj.shouldShowMenu,
        originalGeminiResponse: geminiResponse.text
      }
    })

    // Add menu hint for unknown or general questions
    if (intentObj.shouldShowMenu && intentObj.intent !== 'general_question') {
      result += '\n\nUse /menu to see quick action buttons! 📱'
    }

    return result

  } catch (err) {
    console.error('Error executing intent:', err)
    await logLLMUsage({
      userId,
      telegramUserId,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: userMessage,
      response: 'Error executing action',
      status: 'error',
      sessionId: sessionId || undefined,
      intentDetected: intentObj.intent,
      actionTaken: 'error',
      errorMessage: String(err)
    })
    return 'Sorry, I failed to perform that action. Use /menu to try again with button options.'
  }
}

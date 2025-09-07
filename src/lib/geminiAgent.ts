import { generateGeminiReply } from './gemini'
import {
  createTelegramUserTransaction,
  getTelegramUserTransactions,
  getTelegramUserWallets,
  createTelegramUserWallet,
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
}

export async function handleGeminiTelegramQuery(
  telegramUserId: number,
  telegramChatId: number,
  userMessage: string
) {
  if (!process.env.GEMINI_API_KEY) {
    return 'LLM not configured.'
  }

  if (isRateLimited(telegramUserId)) {
    return '⚠️ You are making requests too quickly. Please wait a moment and try again.'
  }

  // Ask the model to return a strict JSON describing the intent and parameters
  const system = `You are a personal finance assistant for a Telegram bot. When given a user's message, output a JSON object with keys:\n- intent: one of [create_transaction, list_transactions, create_wallet, list_wallets, create_category, list_categories, create_budget, list_budgets, generate_report, unknown]\n- params: object with typed parameters required for the intent (e.g. amount, description, wallet_name, wallet_id, category_name, period)\n- reply: a short human-friendly message that the bot can send immediately.\nOnly output valid JSON. If you cannot map intent, use intent: \"unknown\" and provide reply with a helpful suggestion.`

  const userPrompt = `User message: "${userMessage.replace(/"/g, '\\"')}"\nRespond with JSON only.`

  const fullPrompt = system + '\n\n' + userPrompt

  const raw = await generateGeminiReply(fullPrompt)

  const parsed = extractJSON(raw)
  let intentObj: IntentResult | null = parsed

  // If parsing failed, try to interpret plain text heuristics
  if (!intentObj) {
    // fallback: simple heuristics
    const txt = userMessage.toLowerCase()
    if (txt.includes('add') && txt.includes('transaction')) {
      intentObj = { intent: 'create_transaction', params: {}, reply: 'Okay, I can add a transaction — what is the amount and description?' }
    } else if (txt.includes('list') && txt.includes('transaction')) {
      intentObj = { intent: 'list_transactions', params: { limit: 10 }, reply: 'Here are your recent transactions:' }
    } else if (txt.includes('wallet')) {
      intentObj = { intent: 'list_wallets', params: {}, reply: 'Here are your wallets:' }
    } else {
      intentObj = { intent: 'unknown', reply: raw }
    }
  }

  // Execute safe mapped actions
  try {
    switch (intentObj.intent) {
      case 'create_transaction': {
        const p = intentObj.params || {}
        // Expect amount, description, type, wallet_id
        const amount = Number(p.amount || p.value || 0)
        const description = p.description || p.desc || 'Added via Telegram'
        const type = p.type === 'income' ? 'income' : 'expense'
        const walletId = p.wallet_id || p.walletId || p.wallet || null

        if (!amount || !walletId) {
          return intentObj.reply || 'Please provide an amount and wallet to create a transaction.'
        }

        const transaction = await createTelegramUserTransaction(
          telegramUserId,
          walletId,
          amount,
          description,
          type as 'income' | 'expense',
          p.category_id || p.categoryId
        )

        return intentObj.reply || `✅ Transaction recorded: ${description} — ${amount}`
      }

      case 'list_transactions': {
        const p = intentObj.params || {}
        const limit = Number(p.limit || 10)
        const walletId = p.wallet_id || p.walletId || undefined
        const txs = await getTelegramUserTransactions(telegramUserId, walletId, limit)

        if (!txs || txs.length === 0) return 'No transactions found.'

        let out = '💰 Recent transactions:\n\n'
        txs.forEach((t: any) => {
          out += `${t.type === 'income' ? '💚' : '💸'} ${t.description} — ${t.amount} (${t.wallets?.name || 'wallet'})\n`
        })
        return out
      }

      case 'create_wallet': {
        const p = intentObj.params || {}
        const name = p.name || p.wallet_name || 'New Wallet'
        const currency = p.currency || 'USD'
        const description = p.description || null

        const wallet = await createTelegramUserWallet(telegramUserId, name, description, currency)
        return intentObj.reply || `✅ Wallet created: ${wallet.name} (${wallet.currency})`
      }

      case 'list_wallets': {
        const wallets = await getTelegramUserWallets(telegramUserId)
        if (!wallets || wallets.length === 0) return 'No wallets found.'
        let out = '💼 Your wallets:\n\n'
        wallets.forEach((w: any) => { out += `${w.name} — ${w.balance || 0} ${w.currency}\n` })
        return out
      }

      case 'create_category': {
        const p = intentObj.params || {}
        const name = p.name || 'New Category'
        const type = p.type === 'income' ? 'income' : 'expense'
        const category = await createTelegramUserCategory(telegramUserId, name, type)
        return intentObj.reply || `✅ Category created: ${category.name}`
      }

      case 'list_categories': {
        const cats = await getTelegramUserCategories(telegramUserId)
        if (!cats || cats.length === 0) return 'No categories found.'
        let out = '🏷️ Categories:\n\n'
        cats.forEach((c: any) => out += `${c.name} (${c.type})\n`)
        return out
      }

      case 'create_budget': {
        const p = intentObj.params || {}
        const name = p.name || 'Budget'
        const amount = Number(p.amount || 0)
        const period = p.period || 'monthly'
        const walletId = p.wallet_id || p.walletId
        if (!amount || !walletId) return 'Provide amount and wallet to create a budget.'
        const budget = await createTelegramUserBudget(telegramUserId, walletId, name, amount, period, p.category_id)
        return intentObj.reply || `✅ Budget created: ${budget.name} — ${budget.amount}`
      }

      case 'list_budgets': {
        const budgets = await getTelegramUserBudgets(telegramUserId)
        if (!budgets || budgets.length === 0) return 'No budgets found.'
        let out = '📊 Budgets:\n\n'
        budgets.forEach((b: any) => out += `${b.name} — ${b.amount} (${b.period})\n`)
        return out
      }

      case 'generate_report': {
        // Simple report: totals by type for last N transactions
        const p = intentObj.params || {}
        const limit = Number(p.limit || 100)
        const txs = await getTelegramUserTransactions(telegramUserId, undefined, limit)
        if (!txs || txs.length === 0) return 'No transactions to report.'

        let income = 0
        let expense = 0
        txs.forEach((t: any) => {
          if (t.type === 'income') income += Number(t.amount || 0)
          else expense += Number(t.amount || 0)
        })

        const net = income - expense
        return `📈 Report (last ${txs.length}):\nIncome: ${income}\nExpense: ${expense}\nNet: ${net}`
      }

      case 'unknown':
      default:
        return intentObj.reply || "I couldn't map your request. Try saying 'Add transaction 12.50 for lunch in wallet X' or 'Show me recent transactions'."
    }
  } catch (err) {
    console.error('Error executing intent:', err)
    return 'Sorry, I failed to perform that action.'
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

// Enhanced Telegram Bot webhook handler
export async function POST(request: NextRequest) {
  try {
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
    
    if (!telegramBotToken) {
      console.error('TELEGRAM_BOT_TOKEN not configured')
      return NextResponse.json({ error: 'Bot not configured' }, { status: 500 })
    }

    const body = await request.json()
    console.log('Telegram webhook received:', JSON.stringify(body, null, 2))

    // Handle different types of updates
    if (body.message) {
      await handleTextMessage(body.message)
    } else if (body.callback_query) {
      await handleCallbackQuery(body.callback_query)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleTextMessage(message: any) {
  const chatId = message.chat.id
  const text = message.text
  const userId = message.from.id

  if (!text) return

  // Enhanced bot commands
  if (text === '/start') {
    await sendTelegramMessage(chatId, 
      '🏦 Welcome to Personal Finance Bot!\n\n' +
      '<b>Enhanced Commands:</b>\n' +
      '/start - Show this help\n' +
      '/balance - Check wallet balances\n' +
      '/wallets - List your wallets\n' +
      '/recent - Show recent transactions\n' +
      '/budget - Check budget status\n' +
      '/loans - View loan summary\n' +
      '/analytics - Quick financial summary\n' +
      '/scheduled - Upcoming scheduled transactions\n\n' +
      '<b>Quick Actions:</b>\n' +
      '/expense [amount] [description] - Add expense\n' +
      '/income [amount] [description] - Add income\n\n' +
      '<b>AI Features:</b>\n' +
      'Send natural language messages like:\n' +
      '• "I spent $20 on lunch"\n' +
      '• "Received $1000 salary"\n' +
      '• "Add expense $50 groceries"\n\n' +
      '⚙️ To use these features, connect your Telegram account in the web app.'
    )
  } else if (text === '/balance') {
    await handleBalanceCommand(chatId, userId)
  } else if (text === '/wallets') {
    await handleWalletsCommand(chatId, userId)
  } else if (text === '/recent') {
    await handleRecentTransactionsCommand(chatId, userId)
  } else if (text === '/budget') {
    await handleBudgetCommand(chatId, userId)
  } else if (text === '/loans') {
    await handleLoansCommand(chatId, userId)
  } else if (text === '/analytics') {
    await handleAnalyticsCommand(chatId, userId)
  } else if (text === '/scheduled') {
    await handleScheduledTransactionsCommand(chatId, userId)
  } else if (text.startsWith('/expense')) {
    await handleQuickExpense(chatId, userId, text)
  } else if (text.startsWith('/income')) {
    await handleQuickIncome(chatId, userId, text)
  } else if (text && text.length > 0) {
    // Process natural language message
    await handleNaturalLanguageMessage(chatId, userId, text)
  }
}

async function handleCallbackQuery(callbackQuery: any) {
  const chatId = callbackQuery.message.chat.id
  const data = callbackQuery.data
  const queryId = callbackQuery.id

  // Answer the callback query
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: queryId })
  })

  // Handle different callback actions
  if (data.startsWith('wallet_')) {
    const walletId = data.split('_')[1]
    await showWalletDetails(chatId, walletId)
  } else if (data.startsWith('confirm_')) {
    // Handle transaction confirmations
    await handleTransactionConfirmation(chatId, data)
  }
}

async function handleBalanceCommand(chatId: number, userId: number) {
  // This would require user authentication mapping
  await sendTelegramMessage(chatId, 
    '💰 <b>Balance Summary</b>\n\n' +
    '🔗 To view your actual balances, please connect your Telegram account in the Personal Finance web app.\n\n' +
    'Once connected, you\'ll see:\n' +
    '• Real-time wallet balances\n' +
    '• Total net worth\n' +
    '• Recent changes\n\n' +
    '⚙️ Visit the app settings to link your account.'
  )
}

async function handleWalletsCommand(chatId: number, userId: number) {
  await sendTelegramMessage(chatId, 
    '🏦 <b>Your Wallets</b>\n\n' +
    '🔗 Connect your account to see:\n' +
    '• All your wallets\n' +
    '• Current balances\n' +
    '• Currency information\n' +
    '• Shared wallets\n\n' +
    'Link your Telegram in the web app settings.'
  )
}

async function handleRecentTransactionsCommand(chatId: number, userId: number) {
  await sendTelegramMessage(chatId, 
    '📊 <b>Recent Transactions</b>\n\n' +
    '🔗 Connect your account to view:\n' +
    '• Latest 10 transactions\n' +
    '• Transaction details\n' +
    '• Categories and amounts\n' +
    '• Quick transaction actions\n\n' +
    'Set up the connection in the web app.'
  )
}

async function handleBudgetCommand(chatId: number, userId: number) {
  await sendTelegramMessage(chatId, 
    '📈 <b>Budget Status</b>\n\n' +
    '🔗 Connect to see:\n' +
    '• Active budgets\n' +
    '• Spending progress\n' +
    '• Budget alerts\n' +
    '• Recommendations\n\n' +
    'Link your account to get started.'
  )
}

async function handleLoansCommand(chatId: number, userId: number) {
  await sendTelegramMessage(chatId, 
    '💳 <b>Loans Summary</b>\n\n' +
    '🔗 Connect to view:\n' +
    '• Active loans\n' +
    '• Payment schedules\n' +
    '• Remaining amounts\n' +
    '• Due dates\n\n' +
    'Connect in the web app settings.'
  )
}

async function handleAnalyticsCommand(chatId: number, userId: number) {
  await sendTelegramMessage(chatId, 
    '📊 <b>Financial Analytics</b>\n\n' +
    '🔗 Connect to see:\n' +
    '• Spending trends\n' +
    '• Income vs expenses\n' +
    '• Category breakdowns\n' +
    '• Savings rate\n\n' +
    'Link your account for insights.'
  )
}

async function handleScheduledTransactionsCommand(chatId: number, userId: number) {
  await sendTelegramMessage(chatId, 
    '⏰ <b>Scheduled Transactions</b>\n\n' +
    '🔗 Connect to view:\n' +
    '• Upcoming automated transactions\n' +
    '• Recurring payments\n' +
    '• Schedule management\n' +
    '• Pause/resume options\n\n' +
    'Set up in the web app first.'
  )
}

async function handleQuickExpense(chatId: number, userId: number, text: string) {
  const parts = text.split(' ').slice(1) // Remove '/expense'
  if (parts.length < 2) {
    await sendTelegramMessage(chatId, 
      '❌ Usage: /expense [amount] [description]\n\n' +
      'Example: /expense 25.50 lunch at restaurant\n\n' +
      '💡 You can also use natural language:\n' +
      '"I spent $25.50 on lunch"'
    )
    return
  }

  const amount = parseFloat(parts[0])
  const description = parts.slice(1).join(' ')

  if (isNaN(amount)) {
    await sendTelegramMessage(chatId, '❌ Invalid amount. Please enter a valid number.')
    return
  }

  // This would create the actual transaction when user is authenticated
  await sendTelegramMessage(chatId, 
    `💸 <b>Expense Preview</b>\n\n` +
    `Amount: $${amount.toFixed(2)}\n` +
    `Description: ${description}\n\n` +
    `🔗 Connect your account to save this transaction automatically.\n\n` +
    `For now, please add it manually in the web app.`
  )
}

async function handleQuickIncome(chatId: number, userId: number, text: string) {
  const parts = text.split(' ').slice(1) // Remove '/income'
  if (parts.length < 2) {
    await sendTelegramMessage(chatId, 
      '❌ Usage: /income [amount] [description]\n\n' +
      'Example: /income 1000 monthly salary\n\n' +
      '💡 You can also use natural language:\n' +
      '"I received $1000 salary"'
    )
    return
  }

  const amount = parseFloat(parts[0])
  const description = parts.slice(1).join(' ')

  if (isNaN(amount)) {
    await sendTelegramMessage(chatId, '❌ Invalid amount. Please enter a valid number.')
    return
  }

  // This would create the actual transaction when user is authenticated
  await sendTelegramMessage(chatId, 
    `💰 <b>Income Preview</b>\n\n` +
    `Amount: $${amount.toFixed(2)}\n` +
    `Description: ${description}\n\n` +
    `🔗 Connect your account to save this transaction automatically.\n\n` +
    `For now, please add it manually in the web app.`
  )
}

async function handleNaturalLanguageMessage(chatId: number, userId: number, text: string) {
  // Simple pattern matching for natural language processing
  const amount = extractAmountFromText(text)
  const type = inferTransactionType(text)
  
  if (amount && type) {
    const emoji = type === 'income' ? '💰' : '💸'
    const action = type === 'income' ? 'received' : 'spent'
    
    await sendTelegramMessage(chatId, 
      `${emoji} <b>I understand!</b>\n\n` +
      `You ${action}: $${amount.toFixed(2)}\n` +
      `Description: ${text}\n\n` +
      `🤖 <b>AI Processing Available</b>\n` +
      `Connect your account to enable:\n` +
      `• Automatic transaction creation\n` +
      `• Smart category detection\n` +
      `• Receipt processing\n` +
      `• Spending insights\n\n` +
      `🔗 Set up in the web app settings.`
    )
  } else {
    await sendTelegramMessage(chatId, 
      '🤖 <b>AI Assistant</b>\n\n' +
      'I\'m getting smarter! Soon I\'ll be able to:\n\n' +
      '✨ Process natural language transactions\n' +
      '📸 Analyze receipt images\n' +
      '💡 Provide financial insights\n' +
      '📊 Generate spending reports\n\n' +
      '🔗 Connect your account to unlock AI features!\n\n' +
      'Try: "I spent $20 on lunch" or use /expense 20 lunch'
    )
  }
}

// Helper functions
function extractAmountFromText(text: string): number | null {
  const patterns = [
    /\$(\d+\.?\d*)/,           // $20 or $20.50
    /(\d+\.?\d*)\s*dollars?/,  // 20 dollars
    /(\d+\.?\d*)\s*usd/i,      // 20 USD
    /spent\s+(\d+\.?\d*)/i,    // spent 20
    /received\s+(\d+\.?\d*)/i, // received 20
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return parseFloat(match[1])
    }
  }
  
  return null
}

function inferTransactionType(text: string): 'income' | 'expense' | null {
  const lowerText = text.toLowerCase()
  
  const incomeKeywords = ['received', 'earned', 'salary', 'income', 'profit', 'bonus', 'refund']
  const expenseKeywords = ['spent', 'paid', 'bought', 'purchased', 'cost', 'expense']
  
  if (incomeKeywords.some(keyword => lowerText.includes(keyword))) {
    return 'income'
  }
  
  if (expenseKeywords.some(keyword => lowerText.includes(keyword))) {
    return 'expense'
  }
  
  // Default to expense if amount is detected but type is unclear
  return 'expense'
}

async function showWalletDetails(chatId: number, walletId: string) {
  await sendTelegramMessage(chatId, 
    '🏦 <b>Wallet Details</b>\n\n' +
    '🔗 Connect your account to view detailed wallet information.'
  )
}

async function handleTransactionConfirmation(chatId: number, data: string) {
  await sendTelegramMessage(chatId, 
    '✅ <b>Transaction Confirmed</b>\n\n' +
    'Transaction would be created when account is connected.'
  )
}

async function sendTelegramMessage(chatId: number, text: string) {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
  
  if (!telegramBotToken) {
    console.error('TELEGRAM_BOT_TOKEN not configured')
    return
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    })

    if (!response.ok) {
      console.error('Failed to send Telegram message:', await response.text())
    }
  } catch (error) {
    console.error('Error sending Telegram message:', error)
  }
}

// GET endpoint for webhook setup verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Telegram webhook endpoint is active',
    timestamp: new Date().toISOString()
  })
}
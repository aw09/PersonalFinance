import { NextRequest, NextResponse } from 'next/server'
import { 
  getTelegramUser, 
  getTelegramSession, 
  setTelegramSession, 
  clearTelegramSession,
  linkTelegramAccount,
  cleanupExpiredTelegramData
} from '@/lib/telegramAuth'
import {
  getTelegramUserWallets,
  createTelegramUserWallet,
  getTelegramUserTransactions,
  createTelegramUserTransaction,
  getTelegramUserCategories,
  createTelegramUserCategory,
  getTelegramUserBudgets,
  createTelegramUserBudget,
  getTelegramUserInvestments,
  createTelegramUserInvestment
} from '@/lib/telegramCrud'
import {
  mainMenuKeyboard,
  walletMenuKeyboard,
  transactionMenuKeyboard,
  budgetMenuKeyboard,
  categoryMenuKeyboard,
  investmentMenuKeyboard,
  confirmationKeyboard,
  backKeyboard,
  cancelKeyboard,
  welcomeMessage,
  accountNotLinkedMessage,
  helpMessage,
  errorMessages,
  successMessages,
  formatCurrency,
  formatDate,
  createPaginationKeyboard,
  InlineKeyboard
} from '@/lib/telegramUI'

// Telegram Bot webhook handler
export async function POST(request: NextRequest) {
  try {
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
    
    if (!telegramBotToken) {
      console.error('TELEGRAM_BOT_TOKEN not configured')
      return NextResponse.json({ error: 'Bot not configured' }, { status: 500 })
    }

    // Cleanup expired data periodically
    await cleanupExpiredTelegramData()

    const body = await request.json()
    console.log('Telegram webhook received:', JSON.stringify(body, null, 2))

    // Handle callback queries (inline button presses)
    if (body.callback_query) {
      return await handleCallbackQuery(body.callback_query, telegramBotToken)
    }

    // Handle regular messages
    if (body.message) {
      return await handleMessage(body.message, telegramBotToken)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleMessage(message: any, botToken: string) {
  const chatId = message.chat.id
  const telegramUserId = message.from.id
  const text = message.text
  const telegramUsername = message.from.username

  // Handle commands
  if (text === '/start' || text === '/menu') {
    await clearTelegramSession(telegramUserId)
    const user = await getTelegramUser(telegramUserId)
    
    if (!user) {
      await sendTelegramMessage(botToken, chatId, accountNotLinkedMessage, mainMenuKeyboard)
    } else {
      await sendTelegramMessage(botToken, chatId, welcomeMessage, mainMenuKeyboard)
    }
    return NextResponse.json({ ok: true })
  }

  if (text === '/help') {
    await sendTelegramMessage(botToken, chatId, helpMessage)
    return NextResponse.json({ ok: true })
  }

  if (text === '/cancel') {
    await clearTelegramSession(telegramUserId)
    await sendTelegramMessage(botToken, chatId, '❌ Operation cancelled.', mainMenuKeyboard)
    return NextResponse.json({ ok: true })
  }

  // Handle conversation flow based on session
  const session = await getTelegramSession(telegramUserId)
  if (session && session.current_step) {
    return await handleConversationStep(session, message, botToken)
  }

  // Handle account linking
  if (text && text.length === 6 && /^[A-Z0-9]+$/.test(text)) {
    const result = await linkTelegramAccount(text, telegramUserId, chatId, telegramUsername)
    if (result.success) {
      await sendTelegramMessage(botToken, chatId, successMessages.linked + '\n\nWelcome to Personal Finance Bot! 🎉', mainMenuKeyboard)
    } else {
      await sendTelegramMessage(botToken, chatId, `❌ ${result.error}\n\nTry again or use /start to return to main menu.`)
    }
    return NextResponse.json({ ok: true })
  }

  // Default response for unrecognized messages
  await sendTelegramMessage(
    botToken, 
    chatId, 
    '🤔 I didn\'t understand that. Use /start to see the main menu or /help for assistance.',
    mainMenuKeyboard
  )

  return NextResponse.json({ ok: true })
}

async function handleCallbackQuery(callbackQuery: any, botToken: string) {
  const chatId = callbackQuery.message.chat.id
  const telegramUserId = callbackQuery.from.id
  const data = callbackQuery.callback_data
  const messageId = callbackQuery.message.message_id

  // Answer the callback query to remove loading state
  await answerCallbackQuery(botToken, callbackQuery.id)

  // Check if user is linked for operations that require it
  const user = await getTelegramUser(telegramUserId)
  const requiresAuth = !data.startsWith('menu_') || data === 'menu_link'
  
  if (!user && requiresAuth && data !== 'menu_link') {
    await editTelegramMessage(botToken, chatId, messageId, 
      '🔗 Please link your account first to use this feature.', 
      mainMenuKeyboard)
    return NextResponse.json({ ok: true })
  }

  try {
    // Handle menu navigation
    if (data.startsWith('menu_')) {
      return await handleMenuNavigation(data, chatId, messageId, botToken, user)
    }

    // Handle CRUD operations
    if (data.startsWith('wallet_')) {
      return await handleWalletOperation(data, chatId, messageId, botToken, telegramUserId)
    }
    
    if (data.startsWith('transaction_')) {
      return await handleTransactionOperation(data, chatId, messageId, botToken, telegramUserId)
    }
    
    if (data.startsWith('budget_')) {
      return await handleBudgetOperation(data, chatId, messageId, botToken, telegramUserId)
    }
    
    if (data.startsWith('category_')) {
      return await handleCategoryOperation(data, chatId, messageId, botToken, telegramUserId)
    }
    
    if (data.startsWith('investment_')) {
      return await handleInvestmentOperation(data, chatId, messageId, botToken, telegramUserId)
    }

    // Handle confirmations and cancellations
    if (data.startsWith('confirm_') || data === 'cancel') {
      return await handleConfirmation(data, chatId, messageId, botToken, telegramUserId)
    }

    // Handle selections (wallet, currency, etc.)
    if (data.startsWith('select_')) {
      return await handleSelection(data, chatId, messageId, botToken, telegramUserId)
    }

  } catch (error) {
    console.error('Error handling callback query:', error)
    await editTelegramMessage(botToken, chatId, messageId, errorMessages.generic, mainMenuKeyboard)
  }

  return NextResponse.json({ ok: true })
}

async function handleMenuNavigation(data: string, chatId: number, messageId: number, botToken: string, user: any) {
  const menuType = data.replace('menu_', '')

  switch (menuType) {
    case 'main':
      await editTelegramMessage(botToken, chatId, messageId, welcomeMessage, mainMenuKeyboard)
      break
    
    case 'wallets':
      await editTelegramMessage(botToken, chatId, messageId, 
        '💼 <b>Wallet Management</b>\n\nManage your financial accounts, track balances, and organize your money.',
        walletMenuKeyboard)
      break
    
    case 'transactions':
      await editTelegramMessage(botToken, chatId, messageId,
        '💰 <b>Transaction Management</b>\n\nRecord and track your income and expenses.',
        transactionMenuKeyboard)
      break
    
    case 'budgets':
      await editTelegramMessage(botToken, chatId, messageId,
        '📊 <b>Budget Management</b>\n\nSet spending limits and monitor your financial goals.',
        budgetMenuKeyboard)
      break
    
    case 'categories':
      await editTelegramMessage(botToken, chatId, messageId,
        '🏷️ <b>Category Management</b>\n\nOrganize your transactions with custom categories.',
        categoryMenuKeyboard)
      break
    
    case 'investments':
      await editTelegramMessage(botToken, chatId, messageId,
        '📈 <b>Investment Management</b>\n\nTrack your investment portfolio performance.',
        investmentMenuKeyboard)
      break
    
    case 'link':
      await editTelegramMessage(botToken, chatId, messageId,
        '🔗 <b>Link Account</b>\n\nTo link your Telegram account:\n\n' +
        '1. Go to your Personal Finance web app\n' +
        '2. Navigate to Settings\n' +
        '3. Click "Link Telegram Account"\n' +
        '4. Copy the 6-digit code and send it here\n\n' +
        'The code expires in 10 minutes for security.',
        backKeyboard('main'))
      break
    
    case 'help':
      await editTelegramMessage(botToken, chatId, messageId, helpMessage, backKeyboard('main'))
      break
      
    default:
      await editTelegramMessage(botToken, chatId, messageId, errorMessages.generic, mainMenuKeyboard)
  }
}

// The file is getting quite large - let me continue with the operation handlers...

async function handleWalletOperation(data: string, chatId: number, messageId: number, botToken: string, telegramUserId: number) {
  const operation = data.replace('wallet_', '')

  switch (operation) {
    case 'list':
      const wallets = await getTelegramUserWallets(telegramUserId)
      let walletText = '💼 <b>Your Wallets</b>\n\n'
      
      if (wallets.length === 0) {
        walletText += 'No wallets found. Create your first wallet!'
      } else {
        wallets.forEach((wallet, index) => {
          walletText += `${index + 1}. <b>${wallet.name}</b>\n`
          walletText += `   💰 Balance: ${formatCurrency(wallet.balance, wallet.currency)}\n`
          if (wallet.description) {
            walletText += `   📝 ${wallet.description}\n`
          }
          walletText += '\n'
        })
      }
      
      await editTelegramMessage(botToken, chatId, messageId, walletText, backKeyboard('wallets'))
      break

    case 'create':
      await setTelegramSession(telegramUserId, chatId, {}, 'wallet_create_name')
      await editTelegramMessage(botToken, chatId, messageId, 
        '💼 <b>Create New Wallet</b>\n\nPlease enter the wallet name:', 
        cancelKeyboard)
      break

    default:
      await editTelegramMessage(botToken, chatId, messageId, 'Feature coming soon!', backKeyboard('wallets'))
  }
}

async function handleTransactionOperation(data: string, chatId: number, messageId: number, botToken: string, telegramUserId: number) {
  const operation = data.replace('transaction_', '')

  switch (operation) {
    case 'list':
      const transactions = await getTelegramUserTransactions(telegramUserId)
      let transactionText = '💰 <b>Recent Transactions</b>\n\n'
      
      if (transactions.length === 0) {
        transactionText += 'No transactions found. Add your first transaction!'
      } else {
        transactions.forEach((transaction, index) => {
          const symbol = transaction.type === 'income' ? '💚' : '💸'
          transactionText += `${symbol} <b>${transaction.description}</b>\n`
          transactionText += `   ${formatCurrency(transaction.amount, (transaction as any).wallets?.currency)}\n`
          transactionText += `   📅 ${formatDate(transaction.date)}\n`
          if ((transaction as any).categories) {
            transactionText += `   🏷️ ${(transaction as any).categories.name}\n`
          }
          transactionText += '\n'
        })
      }
      
      await editTelegramMessage(botToken, chatId, messageId, transactionText, backKeyboard('transactions'))
      break

    case 'create':
      const userWallets = await getTelegramUserWallets(telegramUserId)
      if (userWallets.length === 0) {
        await editTelegramMessage(botToken, chatId, messageId, 
          '❌ You need at least one wallet to create a transaction.\n\nPlease create a wallet first.', 
          backKeyboard('transactions'))
        return
      }
      
      await setTelegramSession(telegramUserId, chatId, { wallets: userWallets }, 'transaction_create_wallet')
      
      let walletOptions = '💰 <b>Add Transaction</b>\n\nSelect a wallet:\n\n'
      const walletKeyboard: any = { inline_keyboard: [] }
      
      userWallets.forEach((wallet, index) => {
        walletOptions += `${index + 1}. ${wallet.name} (${formatCurrency(wallet.balance, wallet.currency)})\n`
        walletKeyboard.inline_keyboard.push([
          { text: `💼 ${wallet.name}`, callback_data: `select_wallet_${wallet.id}` }
        ])
      })
      
      walletKeyboard.inline_keyboard.push([
        { text: '❌ Cancel', callback_data: 'cancel' }
      ])
      
      await editTelegramMessage(botToken, chatId, messageId, walletOptions, walletKeyboard)
      break

    default:
      await editTelegramMessage(botToken, chatId, messageId, 'Feature coming soon!', backKeyboard('transactions'))
  }
}

async function handleBudgetOperation(data: string, chatId: number, messageId: number, botToken: string, telegramUserId: number) {
  const operation = data.replace('budget_', '')

  switch (operation) {
    case 'list':
      const budgets = await getTelegramUserBudgets(telegramUserId)
      let budgetText = '📊 <b>Your Budgets</b>\n\n'
      
      if (budgets.length === 0) {
        budgetText += 'No budgets found. Create your first budget!'
      } else {
        budgets.forEach((budget, index) => {
          budgetText += `📊 <b>${budget.name}</b>\n`
          budgetText += `   💰 Amount: ${formatCurrency(budget.amount, (budget as any).wallets?.currency)}\n`
          budgetText += `   📅 Period: ${budget.period}\n`
          if ((budget as any).categories) {
            budgetText += `   🏷️ Category: ${(budget as any).categories.name}\n`
          }
          budgetText += '\n'
        })
      }
      
      await editTelegramMessage(botToken, chatId, messageId, budgetText, backKeyboard('budgets'))
      break

    default:
      await editTelegramMessage(botToken, chatId, messageId, 'Feature coming soon!', backKeyboard('budgets'))
  }
}

async function handleCategoryOperation(data: string, chatId: number, messageId: number, botToken: string, telegramUserId: number) {
  const operation = data.replace('category_', '')

  switch (operation) {
    case 'list':
      const categories = await getTelegramUserCategories(telegramUserId)
      let categoryText = '🏷️ <b>Your Categories</b>\n\n'
      
      if (categories.length === 0) {
        categoryText += 'No categories found. Create your first category!'
      } else {
        const incomeCategories = categories.filter(c => c.type === 'income')
        const expenseCategories = categories.filter(c => c.type === 'expense')
        
        if (incomeCategories.length > 0) {
          categoryText += '💚 <b>Income Categories:</b>\n'
          incomeCategories.forEach(cat => {
            categoryText += `   • ${cat.name}\n`
          })
          categoryText += '\n'
        }
        
        if (expenseCategories.length > 0) {
          categoryText += '💸 <b>Expense Categories:</b>\n'
          expenseCategories.forEach(cat => {
            categoryText += `   • ${cat.name}\n`
          })
        }
      }
      
      await editTelegramMessage(botToken, chatId, messageId, categoryText, backKeyboard('categories'))
      break

    default:
      await editTelegramMessage(botToken, chatId, messageId, 'Feature coming soon!', backKeyboard('categories'))
  }
}

async function handleInvestmentOperation(data: string, chatId: number, messageId: number, botToken: string, telegramUserId: number) {
  const operation = data.replace('investment_', '')

  switch (operation) {
    case 'list':
      const investments = await getTelegramUserInvestments(telegramUserId)
      let investmentText = '📈 <b>Your Investments</b>\n\n'
      
      if (investments.length === 0) {
        investmentText += 'No investments found. Add your first investment!'
      } else {
        investments.forEach((investment, index) => {
          const gainLoss = investment.current_value - investment.initial_amount
          const gainLossPercent = ((gainLoss / investment.initial_amount) * 100).toFixed(2)
          const symbol = gainLoss >= 0 ? '📈' : '📉'
          
          investmentText += `${symbol} <b>${investment.name}</b>\n`
          investmentText += `   💰 Current: ${formatCurrency(investment.current_value, (investment as any).wallets?.currency)}\n`
          investmentText += `   📊 Initial: ${formatCurrency(investment.initial_amount, (investment as any).wallets?.currency)}\n`
          investmentText += `   ${symbol} P&L: ${formatCurrency(gainLoss, (investment as any).wallets?.currency)} (${gainLossPercent}%)\n`
          investmentText += `   🏷️ Type: ${investment.type}\n`
          investmentText += '\n'
        })
      }
      
      await editTelegramMessage(botToken, chatId, messageId, investmentText, backKeyboard('investments'))
      break

    default:
      await editTelegramMessage(botToken, chatId, messageId, 'Feature coming soon!', backKeyboard('investments'))
  }
}

async function handleSelection(data: string, chatId: number, messageId: number, botToken: string, telegramUserId: number) {
  const session = await getTelegramSession(telegramUserId)
  if (!session) {
    await editTelegramMessage(botToken, chatId, messageId, errorMessages.sessionExpired, mainMenuKeyboard)
    return
  }

  const sessionData = session.session_data || {}
  
  if (data.startsWith('select_currency_')) {
    const currency = data.replace('select_currency_', '')
    sessionData.currency = currency
    
    // Create the wallet
    try {
      const wallet = await createTelegramUserWallet(
        telegramUserId,
        sessionData.name,
        sessionData.description,
        currency
      )
      
      await clearTelegramSession(telegramUserId)
      await editTelegramMessage(
        botToken, 
        chatId, 
        messageId,
        `✅ <b>Wallet Created!</b>\n\n💼 Name: ${wallet.name}\n💰 Currency: ${wallet.currency}\n📝 Description: ${wallet.description || 'None'}\n\nYour wallet is ready to use!`,
        mainMenuKeyboard
      )
    } catch (error) {
      console.error('Error creating wallet:', error)
      await editTelegramMessage(botToken, chatId, messageId, errorMessages.generic, mainMenuKeyboard)
    }
  } else if (data.startsWith('select_wallet_')) {
    const walletId = data.replace('select_wallet_', '')
    sessionData.walletId = walletId
    
    await setTelegramSession(telegramUserId, chatId, sessionData, 'transaction_create_type')
    
    const typeKeyboard = {
      inline_keyboard: [
        [
          { text: '💚 Income', callback_data: 'select_type_income' },
          { text: '💸 Expense', callback_data: 'select_type_expense' }
        ],
        [
          { text: '❌ Cancel', callback_data: 'cancel' }
        ]
      ]
    }
    
    await editTelegramMessage(
      botToken,
      chatId,
      messageId,
      '💰 <b>Add Transaction</b>\n\nWhat type of transaction is this?',
      typeKeyboard
    )
  } else if (data.startsWith('select_type_')) {
    const type = data.replace('select_type_', '')
    sessionData.type = type
    
    await setTelegramSession(telegramUserId, chatId, sessionData, 'transaction_create_amount')
    await editTelegramMessage(
      botToken,
      chatId,
      messageId,
      `💰 <b>Add ${type === 'income' ? 'Income' : 'Expense'}</b>\n\nEnter the amount (numbers only):`,
      cancelKeyboard
    )
  }
}

async function handleConfirmation(data: string, chatId: number, messageId: number, botToken: string, telegramUserId: number) {
  if (data === 'cancel') {
    await clearTelegramSession(telegramUserId)
    await editTelegramMessage(botToken, chatId, messageId, '❌ Operation cancelled.', mainMenuKeyboard)
    return
  }

  // Handle specific confirmations
  if (data.startsWith('confirm_')) {
    // Implementation for specific confirmations would go here
    await editTelegramMessage(botToken, chatId, messageId, 'Feature coming soon!', mainMenuKeyboard)
  }
}

async function handleConversationStep(session: any, message: any, botToken: string) {
  const chatId = message.chat.id
  const telegramUserId = message.from.id
  const text = message.text?.trim()
  const step = session.current_step
  const sessionData = session.session_data || {}

  switch (step) {
    case 'wallet_create_name':
      if (!text) {
        await sendTelegramMessage(botToken, chatId, '❌ Please enter a valid wallet name.')
        return NextResponse.json({ ok: true })
      }
      
      sessionData.name = text
      await setTelegramSession(telegramUserId, chatId, sessionData, 'wallet_create_description')
      await sendTelegramMessage(
        botToken, 
        chatId, 
        `💼 <b>Create Wallet</b>\n\nName: ${text}\n\nEnter a description (optional, send "skip" to skip):`, 
        cancelKeyboard
      )
      break

    case 'wallet_create_description':
      const description = text === 'skip' ? null : text
      if (description) sessionData.description = description
      
      sessionData.currency = 'USD' // Default currency
      await setTelegramSession(telegramUserId, chatId, sessionData, 'wallet_create_currency')
      
      const currencyKeyboard = {
        inline_keyboard: [
          [
            { text: '💵 USD', callback_data: 'select_currency_USD' },
            { text: '💶 EUR', callback_data: 'select_currency_EUR' }
          ],
          [
            { text: '💷 GBP', callback_data: 'select_currency_GBP' },
            { text: '💴 JPY', callback_data: 'select_currency_JPY' }
          ],
          [
            { text: '❌ Cancel', callback_data: 'cancel' }
          ]
        ]
      }
      
      await sendTelegramMessage(
        botToken,
        chatId,
        `💼 <b>Create Wallet</b>\n\nName: ${sessionData.name}\nDescription: ${description || 'None'}\n\nSelect currency:`,
        currencyKeyboard
      )
      break

    case 'transaction_create_amount':
      const amount = parseFloat(text || '')
      if (isNaN(amount) || amount <= 0) {
        await sendTelegramMessage(botToken, chatId, '❌ Please enter a valid positive number.')
        return NextResponse.json({ ok: true })
      }
      
      sessionData.amount = amount
      await setTelegramSession(telegramUserId, chatId, sessionData, 'transaction_create_description')
      await sendTelegramMessage(
        botToken, 
        chatId, 
        `💰 <b>Add ${sessionData.type === 'income' ? 'Income' : 'Expense'}</b>\n\nAmount: ${formatCurrency(amount)}\n\nEnter a description:`, 
        cancelKeyboard
      )
      break

    case 'transaction_create_description':
      if (!text) {
        await sendTelegramMessage(botToken, chatId, '❌ Please enter a valid description.')
        return NextResponse.json({ ok: true })
      }
      
      sessionData.description = text
      
      // Create the transaction
      try {
        const transaction = await createTelegramUserTransaction(
          telegramUserId,
          sessionData.walletId,
          sessionData.amount,
          sessionData.description,
          sessionData.type
        )
        
        await clearTelegramSession(telegramUserId)
        await sendTelegramMessage(
          botToken, 
          chatId, 
          `✅ <b>Transaction Added!</b>\n\n` +
          `${sessionData.type === 'income' ? '💚' : '💸'} ${sessionData.description}\n` +
          `💰 Amount: ${formatCurrency(sessionData.amount)}\n` +
          `💼 Wallet: ${(transaction as any).wallets?.name}\n\n` +
          `Your transaction has been recorded successfully!`,
          mainMenuKeyboard
        )
      } catch (error) {
        console.error('Error creating transaction:', error)
        await sendTelegramMessage(botToken, chatId, errorMessages.generic, mainMenuKeyboard)
      }
      break

    default:
      await sendTelegramMessage(botToken, chatId, '❌ Unknown step. Use /cancel to start over.')
  }

  return NextResponse.json({ ok: true })
}

// Helper functions for Telegram API
async function sendTelegramMessage(
  botToken: string, 
  chatId: number, 
  text: string, 
  keyboard?: InlineKeyboard
) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: keyboard
      })
    })

    if (!response.ok) {
      console.error('Failed to send Telegram message:', await response.text())
    }
  } catch (error) {
    console.error('Error sending Telegram message:', error)
  }
}

async function editTelegramMessage(
  botToken: string,
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard
) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: keyboard
      })
    })

    if (!response.ok) {
      console.error('Failed to edit Telegram message:', await response.text())
    }
  } catch (error) {
    console.error('Error editing Telegram message:', error)
  }
}

async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text
      })
    })

    if (!response.ok) {
      console.error('Failed to answer callback query:', await response.text())
    }
  } catch (error) {
    console.error('Error answering callback query:', error)
  }
}

// GET endpoint for webhook setup verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Telegram webhook endpoint is active',
    timestamp: new Date().toISOString()
  })
}
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
  InlineKeyboard,
  getMainMenuKeyboard
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
    console.log('=== TELEGRAM WEBHOOK RECEIVED ===')
    console.log('Full body:', JSON.stringify(body, null, 2))
    console.log('Has callback_query:', !!body.callback_query)
    console.log('Has message:', !!body.message)
    console.log('================================')

    // Handle callback queries (inline button presses)
    if (body.callback_query) {
      console.log('Processing callback query...')
      const result = await handleCallbackQuery(body.callback_query, telegramBotToken)
      console.log('Callback query processed, returning result')
      return result
    }

    // Handle regular messages
    if (body.message) {
      console.log('Processing regular message...')
      const result = await handleMessage(body.message, telegramBotToken)
      console.log('Message processed, returning result')
      return result
    }

    console.log('No callback_query or message found, returning generic success')
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('=== TELEGRAM WEBHOOK ERROR ===')
    console.error('Error details:', error)
    console.error('===============================')
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
      await sendTelegramMessage(botToken, chatId, accountNotLinkedMessage, getMainMenuKeyboard(false))
    } else {
      await sendTelegramMessage(botToken, chatId, welcomeMessage, getMainMenuKeyboard(true))
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
      // After successful linking show linked main menu
      await sendTelegramMessage(botToken, chatId, successMessages.linked + '\n\nWelcome to Personal Finance Bot! 🎉', getMainMenuKeyboard(true))
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
  console.log('=== PROCESSING CALLBACK QUERY ===')
  console.log('Full callback query:', JSON.stringify(callbackQuery, null, 2))
  
  const chatId = callbackQuery.message.chat.id
  const telegramUserId = callbackQuery.from.id
  // Telegram callback_query payload uses `data` (not `callback_data`).
  // Support both keys to be resilient to different payload shapes and tests.
  const data = callbackQuery.data ?? callbackQuery.callback_data
  const messageId = callbackQuery.message.message_id

  console.log('Extracted data:')
  console.log('- Chat ID:', chatId)
  console.log('- User ID:', telegramUserId)
  console.log('- Callback data:', data)
  console.log('- Message ID:', messageId)

  // Answer the callback query to remove loading state
  console.log('Answering callback query:', callbackQuery.id)
  await answerCallbackQuery(botToken, callbackQuery.id)
  console.log('Callback query answered')

  // Check if user is linked for operations that require it
  console.log('Checking user authentication...')
  const user = await getTelegramUser(telegramUserId)
  // Guard against undefined `data` when determining if the action requires auth
  const requiresAuth = !(data?.startsWith('menu_')) || data === 'menu_link'
  console.log('User found:', !!user, 'Requires auth:', requiresAuth)
  
  if (!user && requiresAuth && data !== 'menu_link') {
    console.log('User not linked, showing auth required message')
    await editTelegramMessage(botToken, chatId, messageId, 
      '🔗 Please link your account first to use this feature.', 
      mainMenuKeyboard)
    return NextResponse.json({ ok: true })
  }

  try {
    console.log('Processing callback data:', data)
    
    // Handle menu navigation
    if (data.startsWith('menu_')) {
      console.log('Handling menu navigation')
      return await handleMenuNavigation(data, chatId, messageId, botToken, user)
    }

    // Handle CRUD operations
    if (data.startsWith('wallet_')) {
      console.log('Handling wallet operation')
      return await handleWalletOperation(data, chatId, messageId, botToken, telegramUserId)
    }
    
    if (data.startsWith('transaction_')) {
      console.log('Handling transaction operation')
      return await handleTransactionOperation(data, chatId, messageId, botToken, telegramUserId)
    }
    
    if (data.startsWith('budget_')) {
      console.log('Handling budget operation')
      return await handleBudgetOperation(data, chatId, messageId, botToken, telegramUserId)
    }
    
    if (data.startsWith('category_')) {
      console.log('Handling category operation')
      return await handleCategoryOperation(data, chatId, messageId, botToken, telegramUserId)
    }
    
    if (data.startsWith('investment_')) {
      console.log('Handling investment operation')
      return await handleInvestmentOperation(data, chatId, messageId, botToken, telegramUserId)
    }

    // Handle confirmations and cancellations
    if (data.startsWith('confirm_') || data === 'cancel') {
      console.log('Handling confirmation')
      return await handleConfirmation(data, chatId, messageId, botToken, telegramUserId)
    }

    // Handle selections (wallet, currency, etc.)
    if (data.startsWith('select_')) {
      console.log('Handling selection')
      return await handleSelection(data, chatId, messageId, botToken, telegramUserId)
    }

    console.log('No handler found for callback data:', data)
    await editTelegramMessage(botToken, chatId, messageId, 'Unknown action', mainMenuKeyboard)

  } catch (error) {
    console.error('=== ERROR IN CALLBACK HANDLER ===')
    console.error('Error handling callback query:', error)
    console.error('===============================')
    await editTelegramMessage(botToken, chatId, messageId, errorMessages.generic, mainMenuKeyboard)
    return NextResponse.json({ ok: true })
  }

  console.log('Callback query processing completed')
  return NextResponse.json({ ok: true })
}

async function handleMenuNavigation(data: string, chatId: number, messageId: number, botToken: string, user: any) {
  const menuType = data.replace('menu_', '')

  switch (menuType) {
    case 'main':
      // Show linked-aware main menu depending on user
      await editTelegramMessage(botToken, chatId, messageId, welcomeMessage, getMainMenuKeyboard(!!user))
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
  
  return NextResponse.json({ ok: true })
}

// The file is getting quite large - let me continue with the operation handlers...

async function handleWalletOperation(data: string, chatId: number, messageId: number, botToken: string, telegramUserId: number) {
  const parts = data.split('_')
  const operation = parts[1]
  const walletId = parts.length > 2 ? parts[2] : null

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

    case 'view':
    case 'edit': 
    case 'delete':
      if (walletId) {
        // Handle specific wallet action
        return await handleSpecificWalletAction(operation, walletId, chatId, messageId, botToken, telegramUserId)
      } else {
        // Show wallet selection
        const allWallets = await getTelegramUserWallets(telegramUserId)
        if (allWallets.length === 0) {
          await editTelegramMessage(botToken, chatId, messageId, 
            '❌ No wallets found. Create your first wallet!', 
            backKeyboard('wallets'))
          return
        }
        
        let actionText = operation === 'view' ? 'View' : operation === 'edit' ? 'Edit' : 'Delete'
        let actionEmoji = operation === 'view' ? '👁️' : operation === 'edit' ? '✏️' : '🗑️'
        
        let selectText = `${actionEmoji} <b>${actionText} Wallet</b>\n\nSelect a wallet:\n\n`
        const walletSelectKeyboard: any = { inline_keyboard: [] }
        
        allWallets.forEach((wallet, index) => {
          selectText += `${index + 1}. ${wallet.name} (${formatCurrency(wallet.balance, wallet.currency)})\n`
          walletSelectKeyboard.inline_keyboard.push([
            { text: `💼 ${wallet.name}`, callback_data: `wallet_${operation}_${wallet.id}` }
          ])
        })
        
        walletSelectKeyboard.inline_keyboard.push([
          { text: '🔙 Back', callback_data: 'menu_wallets' }
        ])
        
        await editTelegramMessage(botToken, chatId, messageId, selectText, walletSelectKeyboard)
      }
      break

    default:
      await editTelegramMessage(botToken, chatId, messageId, 'Unknown wallet operation!', backKeyboard('wallets'))
  }
  
  return NextResponse.json({ ok: true })
}

async function handleSpecificWalletAction(
  action: string, 
  walletId: string, 
  chatId: number, 
  messageId: number, 
  botToken: string, 
  telegramUserId: number
) {
  try {
    const wallets = await getTelegramUserWallets(telegramUserId)
    const wallet = wallets.find(w => w.id === walletId)
    
    if (!wallet) {
      await editTelegramMessage(botToken, chatId, messageId, 
        '❌ Wallet not found!', backKeyboard('wallets'))
      return
    }

    switch (action) {
      case 'view':
        let viewText = `👁️ <b>Wallet Details</b>\n\n`
        viewText += `💼 <b>Name:</b> ${wallet.name}\n`
        viewText += `💰 <b>Balance:</b> ${formatCurrency(wallet.balance, wallet.currency)}\n`
        viewText += `💱 <b>Currency:</b> ${wallet.currency}\n`
        if (wallet.description) {
          viewText += `📝 <b>Description:</b> ${wallet.description}\n`
        }
        viewText += `📅 <b>Created:</b> ${formatDate(wallet.created_at)}\n`
        
        const viewKeyboard = {
          inline_keyboard: [
            [
              { text: '✏️ Edit', callback_data: `wallet_edit_${walletId}` },
              { text: '🗑️ Delete', callback_data: `wallet_delete_${walletId}` }
            ],
            [
              { text: '🔙 Back to Wallets', callback_data: 'menu_wallets' }
            ]
          ]
        }
        
        await editTelegramMessage(botToken, chatId, messageId, viewText, viewKeyboard)
        break

      case 'delete':
        const confirmText = `🗑️ <b>Delete Wallet</b>\n\n` +
          `Are you sure you want to delete "${wallet.name}"?\n\n` +
          `⚠️ <b>Warning:</b> This action cannot be undone!`
        
        const confirmKeyboard = {
          inline_keyboard: [
            [
              { text: '✅ Yes, Delete', callback_data: `confirm_delete_wallet_${walletId}` },
              { text: '❌ Cancel', callback_data: `wallet_view_${walletId}` }
            ]
          ]
        }
        
        await editTelegramMessage(botToken, chatId, messageId, confirmText, confirmKeyboard)
        break

      case 'edit':
        await editTelegramMessage(botToken, chatId, messageId, 
          '✏️ Wallet editing coming soon!', backKeyboard('wallets'))
        break
    }
  } catch (error) {
    console.error('Error handling wallet action:', error)
    await editTelegramMessage(botToken, chatId, messageId, errorMessages.generic, backKeyboard('wallets'))
  }
  
  return NextResponse.json({ ok: true })
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
  
  return NextResponse.json({ ok: true })
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
  
  return NextResponse.json({ ok: true })
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

    case 'create':
      await setTelegramSession(telegramUserId, chatId, {}, 'category_create_type')
      
      const typeKeyboard = {
        inline_keyboard: [
          [
            { text: '💚 Income Category', callback_data: 'select_category_type_income' },
            { text: '💸 Expense Category', callback_data: 'select_category_type_expense' }
          ],
          [
            { text: '❌ Cancel', callback_data: 'cancel' }
          ]
        ]
      }
      
      await editTelegramMessage(botToken, chatId, messageId, 
        '🏷️ <b>Create New Category</b>\n\nWhat type of category do you want to create?',
        typeKeyboard)
      break

    default:
      await editTelegramMessage(botToken, chatId, messageId, 'Feature coming soon!', backKeyboard('categories'))
  }
  
  return NextResponse.json({ ok: true })
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
  
  return NextResponse.json({ ok: true })
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
  } else if (data.startsWith('select_category_type_')) {
    const type = data.replace('select_category_type_', '')
    sessionData.type = type
    
    await setTelegramSession(telegramUserId, chatId, sessionData, 'category_create_name')
    await editTelegramMessage(
      botToken,
      chatId,
      messageId,
      `🏷️ <b>Create ${type === 'income' ? 'Income' : 'Expense'} Category</b>\n\nEnter the category name:`,
      cancelKeyboard
    )
  } else if (data.startsWith('select_category_')) {
    const categoryPart = data.replace('select_category_', '')
    
    if (categoryPart.startsWith('type_')) {
      // This is already handled above
      return
    }
    
    const categoryId = categoryPart === 'skip' ? null : categoryPart
    sessionData.categoryId = categoryId
    
    // Create the transaction
    try {
      const transaction = await createTelegramUserTransaction(
        telegramUserId,
        sessionData.walletId,
        sessionData.amount,
        sessionData.description,
        sessionData.type,
        categoryId || undefined
      )
      
      await clearTelegramSession(telegramUserId)
      await editTelegramMessage(
        botToken,
        chatId,
        messageId,
        `✅ <b>Transaction Added!</b>\n\n` +
        `${sessionData.type === 'income' ? '💚' : '💸'} ${sessionData.description}\n` +
        `💰 Amount: ${formatCurrency(sessionData.amount)}\n` +
        `💼 Wallet: ${(transaction as any).wallets?.name}\n` +
        (categoryId && (transaction as any).categories ? `🏷️ Category: ${(transaction as any).categories.name}\n` : '') +
        `\nYour transaction has been recorded successfully!`,
        mainMenuKeyboard
      )
    } catch (error) {
      console.error('Error creating transaction:', error)
      await editTelegramMessage(botToken, chatId, messageId, errorMessages.generic, mainMenuKeyboard)
    }
  }
  
  return NextResponse.json({ ok: true })
}

async function handleConfirmation(data: string, chatId: number, messageId: number, botToken: string, telegramUserId: number) {
  if (data === 'cancel') {
    await clearTelegramSession(telegramUserId)
    await editTelegramMessage(botToken, chatId, messageId, '❌ Operation cancelled.', mainMenuKeyboard)
    return
  }

  // Handle specific confirmations
  if (data.startsWith('confirm_delete_wallet_')) {
    const walletId = data.replace('confirm_delete_wallet_', '')
    const { deleteTelegramUserWallet } = await import('@/lib/telegramCrud')
    
    try {
      await deleteTelegramUserWallet(telegramUserId, walletId)
      await editTelegramMessage(
        botToken, 
        chatId, 
        messageId, 
        '✅ <b>Wallet Deleted!</b>\n\nThe wallet has been successfully deleted.',
        mainMenuKeyboard
      )
    } catch (error: any) {
      let errorMsg = errorMessages.generic
      if (error.message?.includes('existing transactions')) {
        errorMsg = '❌ Cannot delete wallet with existing transactions. Please delete all transactions first.'
      }
      await editTelegramMessage(botToken, chatId, messageId, errorMsg, backKeyboard('wallets'))
    }
  } else if (data.startsWith('confirm_')) {
    // Handle other confirmations
    await editTelegramMessage(botToken, chatId, messageId, 'Feature coming soon!', mainMenuKeyboard)
  }
  
  return NextResponse.json({ ok: true })
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
      
      // Get categories for this transaction type
      const categories = await getTelegramUserCategories(telegramUserId)
      const relevantCategories = categories.filter(c => c.type === sessionData.type)
      
      if (relevantCategories.length === 0) {
        // Create transaction without category
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
      } else {
        // Show category selection
        await setTelegramSession(telegramUserId, chatId, sessionData, 'transaction_create_category')
        
        let categoryText = `💰 <b>Add ${sessionData.type === 'income' ? 'Income' : 'Expense'}</b>\n\n`
        categoryText += `${sessionData.type === 'income' ? '💚' : '💸'} ${sessionData.description}\n`
        categoryText += `💰 Amount: ${formatCurrency(sessionData.amount)}\n\n`
        categoryText += `Select a category (or skip):\n\n`
        
        const categoryKeyboard: any = { inline_keyboard: [] }
        
        relevantCategories.forEach((category) => {
          categoryKeyboard.inline_keyboard.push([
            { text: `🏷️ ${category.name}`, callback_data: `select_category_${category.id}` }
          ])
        })
        
        categoryKeyboard.inline_keyboard.push([
          { text: '⏭️ Skip Category', callback_data: 'select_category_skip' }
        ])
        categoryKeyboard.inline_keyboard.push([
          { text: '❌ Cancel', callback_data: 'cancel' }
        ])
        
        await sendTelegramMessage(botToken, chatId, categoryText, categoryKeyboard)
      }
      break

    case 'category_create_name':
      if (!text) {
        await sendTelegramMessage(botToken, chatId, '❌ Please enter a valid category name.')
        return NextResponse.json({ ok: true })
      }
      
      sessionData.name = text
      
      // Create the category
      try {
        const { createTelegramUserCategory } = await import('@/lib/telegramCrud')
        const category = await createTelegramUserCategory(
          telegramUserId,
          sessionData.name,
          sessionData.type
        )
        
        await clearTelegramSession(telegramUserId)
        await sendTelegramMessage(
          botToken, 
          chatId, 
          `✅ <b>Category Created!</b>\n\n` +
          `🏷️ Name: ${category.name}\n` +
          `${sessionData.type === 'income' ? '💚' : '💸'} Type: ${sessionData.type}\n\n` +
          `Your category is ready to use!`,
          mainMenuKeyboard
        )
      } catch (error) {
        console.error('Error creating category:', error)
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
    console.log('Attempting to send Telegram message to chat:', chatId)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
    
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: keyboard
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to send Telegram message:', response.status, errorText)
    } else {
      console.log('Successfully sent Telegram message')
    }
  } catch (error) {
    console.error('Error sending Telegram message (this may be expected in sandboxed environments):', error)
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
    console.log('Attempting to edit Telegram message:', messageId, 'in chat:', chatId)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
    
    const response = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: keyboard
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to edit Telegram message:', response.status, errorText)
    } else {
      console.log('Successfully edited Telegram message')
    }
  } catch (error) {
    console.error('Error editing Telegram message (this may be expected in sandboxed environments):', error)
  }
}

async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string) {
  try {
    console.log('Attempting to answer callback query:', callbackQueryId)
    
    // In sandboxed environments, external API calls might be blocked
    // We'll still attempt the call but won't let failures break the webhook
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
    
    const response = await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    const responseText = await response.text()
    console.log('Telegram answerCallbackQuery response:', response.status, responseText)

    if (!response.ok) {
      console.error('Failed to answer callback query:', response.status, responseText)
    } else {
      console.log('Successfully answered callback query')
    }
  } catch (error) {
    console.error('Error answering callback query (this may be expected in sandboxed environments):', error)
    // Don't throw the error - we still want the webhook to return success
  }
}

// GET endpoint for webhook setup verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Telegram webhook endpoint is active',
    timestamp: new Date().toISOString()
  })
}
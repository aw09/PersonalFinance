import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Telegram Bot webhook handler
export async function POST(request: NextRequest) {
  try {
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
    
    if (!telegramBotToken) {
      console.error('TELEGRAM_BOT_TOKEN not configured')
      return NextResponse.json({ error: 'Bot not configured' }, { status: 500 })
    }

    const body = await request.json()
    console.log('Telegram webhook received:', JSON.stringify(body, null, 2))

    // Basic webhook validation (you should implement proper validation)
    if (!body.message) {
      return NextResponse.json({ ok: true })
    }

    const message = body.message
    const chatId = message.chat.id
    const text = message.text

    // Basic bot responses
    if (text === '/start') {
      await sendTelegramMessage(chatId, 
        '🏦 Welcome to Personal Finance Bot!\n\n' +
        'Commands:\n' +
        '/start - Show this help\n' +
        '/balance - Check your balance\n' +
        '/expense [amount] [description] - Add expense\n' +
        '/income [amount] [description] - Add income\n\n' +
        'You can also send natural language messages like:\n' +
        '"I spent $20 on lunch" or "Received $1000 salary"'
      )
    } else if (text === '/balance') {
      await sendTelegramMessage(chatId, 
        '💰 Your current balance: $0.00\n\n' +
        'This feature will show your actual balance once you connect your Telegram account to your Personal Finance account.'
      )
    } else if (text?.startsWith('/expense')) {
      await sendTelegramMessage(chatId, 
        '💸 Expense tracking is coming soon!\n\n' +
        'This will allow you to quickly add expenses directly from Telegram.'
      )
    } else if (text?.startsWith('/income')) {
      await sendTelegramMessage(chatId, 
        '💰 Income tracking is coming soon!\n\n' +
        'This will allow you to quickly add income directly from Telegram.'
      )
    } else if (text && text.length > 0) {
      // For now, just acknowledge the message
      await sendTelegramMessage(chatId, 
        '🤖 I received your message!\n\n' +
        'AI-powered transaction processing is coming soon. You\'ll be able to send messages like "I spent $20 on lunch" and I\'ll automatically create the transaction for you.'
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
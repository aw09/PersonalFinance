/** @jest-environment node */

import { describe, it, expect, beforeEach, afterEach, jest, beforeAll } from '@jest/globals'
import type { NextResponse } from 'next/server'
type TelegramWebhookModule = typeof import('../../src/app/api/telegram/webhook/route')
let POST: TelegramWebhookModule['POST']

jest.mock('../../src/lib/telegramAuth', () => ({
  getTelegramUser: jest.fn(),
  getTelegramSession: jest.fn(),
  setTelegramSession: jest.fn(),
  clearTelegramSession: jest.fn(),
  linkTelegramAccount: jest.fn(),
  cleanupExpiredTelegramData: jest.fn()
}))

jest.mock('../../src/lib/telegramCrud', () => ({
  getTelegramUserWallets: jest.fn(),
  createTelegramUserWallet: jest.fn(),
  getTelegramUserTransactions: jest.fn(),
  createTelegramUserTransaction: jest.fn(),
  getTelegramUserCategories: jest.fn(),
  createTelegramUserCategory: jest.fn(),
  getTelegramUserBudgets: jest.fn(),
  createTelegramUserBudget: jest.fn(),
  getTelegramUserInvestments: jest.fn(),
  createTelegramUserInvestment: jest.fn()
}))

jest.mock('../../src/lib/gemini', () => ({
  generateGeminiReply: jest.fn()
}))

const mockGetTelegramUser = require('../../src/lib/telegramAuth').getTelegramUser as jest.MockedFunction<(...args: any[]) => Promise<any>>
const mockCleanupExpiredTelegramData = require('../../src/lib/telegramAuth').cleanupExpiredTelegramData as jest.MockedFunction<() => Promise<any>>
const mockGetTelegramUserWallets = require('../../src/lib/telegramCrud').getTelegramUserWallets as jest.MockedFunction<(...args: any[]) => Promise<any>>

const createRequest = (body: any) => ({
  json: async () => body
}) as any

describe('Telegram webhook callback handling', () => {
  let fetchMock: jest.Mock

  beforeAll(() => {
    jest.isolateModules(() => {
      const webhookModule = require('../../src/app/api/telegram/webhook/route') as TelegramWebhookModule
      POST = webhookModule.POST
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock = global.fetch as jest.Mock
    fetchMock.mockImplementation(async (..._args: any[]) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      text: async () => JSON.stringify({ ok: true })
    }))

    mockCleanupExpiredTelegramData.mockResolvedValue(undefined)
    mockGetTelegramUser.mockResolvedValue({
      id: 'user-123',
      email: 'user@example.com'
    })
  })

  afterEach(() => {
    fetchMock.mockReset()
  })

  it('should navigate to the wallet menu when the menu_wallets button is pressed', async () => {
    const body = {
      callback_query: {
        id: 'cb-1',
        from: { id: 1001 },
        message: { chat: { id: 2002 }, message_id: 42 },
        data: 'menu_wallets'
      }
    }

  const response = await POST(createRequest(body)) as NextResponse

  expect(response).toBeDefined()
  expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalled()

    const editCall = fetchMock.mock.calls.find(call => (call[0] as string).includes('editMessageText'))
    expect(editCall).toBeDefined()

    const [, editOptions] = editCall as [string, RequestInit]
    const payload = JSON.parse(editOptions!.body as string)

    expect(payload.text).toContain('Wallet Management')
    expect(payload.reply_markup.inline_keyboard[0][0].callback_data).toBe('wallet_list')
  })

  it('should list wallets when the wallet_list button is pressed', async () => {
    mockGetTelegramUserWallets.mockResolvedValue([
      {
        id: 'wallet_001',
        name: 'Main Account',
        currency: 'USD',
        balance: 2450.75,
        description: 'Primary wallet'
      },
      {
        id: 'wallet_002',
        name: 'Savings',
        currency: 'USD',
        balance: 10000
      }
    ])

    const body = {
      callback_query: {
        id: 'cb-2',
        from: { id: 1001 },
        message: { chat: { id: 2002 }, message_id: 84 },
        data: 'wallet_list'
      }
    }

  const response = await POST(createRequest(body)) as NextResponse

  expect(response).toBeDefined()
  expect(response.status).toBe(200)
    expect(mockGetTelegramUserWallets).toHaveBeenCalledWith(1001)

    const editCall = fetchMock.mock.calls.find(call => (call[0] as string).includes('editMessageText'))
    expect(editCall).toBeDefined()

    const [, editOptions] = editCall as [string, RequestInit]
    const payload = JSON.parse(editOptions!.body as string)

    expect(payload.text).toContain('Your Wallets')
    expect(payload.text).toContain('Main Account')
    expect(payload.text).toContain('Savings')
  })
})

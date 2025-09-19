import { NextRequest, NextResponse } from 'next/server'
import { Database } from '@/types/database'
import { withAuth, createErrorResponse, createSuccessResponse, withErrorHandling, validateRequiredFields, AuthenticatedRequest } from '@/lib/apiMiddleware'

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { data: budgets, error } = await request.supabase
      .from('budgets')
      .select(`
        *,
        categories (name, color, icon),
        wallets (name, currency)
      `)
      .eq('user_id', request.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching budgets:', error)
      return createErrorResponse('Failed to fetch budgets')
    }

    return createSuccessResponse({ budgets })
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error')
  }
});

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json()
    const { name, amount, period = 'monthly', category_id, wallet_id, start_date, end_date } = body

    // Validate required fields using utility function
    const validationError = validateRequiredFields(body, ['name', 'amount', 'wallet_id'])
    if (validationError) {
      return createErrorResponse(validationError, 400)
    }

    if (!['weekly', 'monthly', 'yearly'].includes(period)) {
      return createErrorResponse('Period must be weekly, monthly, or yearly', 400)
    }

    // Validate wallet access using authenticated client (RLS enforced)
    const { data: wallet, error: walletError } = await request.supabase
      .from('wallets')
      .select('id')
      .eq('id', wallet_id)
      .single()

    if (walletError || !wallet) {
      console.error('Wallet access denied:', walletError)
      return createErrorResponse('Invalid wallet', 400)
    }

    const { data: budget, error } = await request.supabase
      .from('budgets')
      .insert({
        name,
        amount,
        period,
        category_id: category_id || null,
        wallet_id,
        user_id: request.user.id,
        start_date: start_date || new Date().toISOString(),
        end_date: end_date || null
      })
      .select(`
        *,
        categories (name, color, icon),
        wallets (name, currency)
      `)
      .single()

    if (error) {
      console.error('Error creating budget:', error)
      return createErrorResponse('Failed to create budget')
    }

    return createSuccessResponse({ budget }, 201)
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error')
  }
});
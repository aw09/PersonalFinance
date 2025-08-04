import { NextRequest, NextResponse } from 'next/server'
import { Database } from '@/types/database'

export async function GET(request: NextRequest) {
  const { getSupabaseUser, createAuthSupabase, getAuthToken } = await import('@/lib/authSupabase');
  const user = await getSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Invalid or missing token' }, { status: 401 });
  }
  const token = getAuthToken(request)!;
  const supabase = createAuthSupabase(token);

  try {
    const { data: budgets, error } = await supabase
      .from('budgets')
      .select(`
        *,
        categories (name, color, icon),
        wallets (name, currency)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching budgets:', error)
      return NextResponse.json({ error: 'Failed to fetch budgets' }, { status: 500 })
    }

    return NextResponse.json({ budgets })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { getSupabaseUser, createAuthSupabase, getAuthToken } = await import('@/lib/authSupabase');
  const user = await getSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Invalid or missing token' }, { status: 401 });
  }
  const token = getAuthToken(request)!;
  const supabase = createAuthSupabase(token);

  try {
    const body = await request.json()
    const { name, amount, period = 'monthly', category_id, wallet_id, start_date, end_date } = body

    if (!name || !amount || !wallet_id) {
      return NextResponse.json({ error: 'Name, amount, and wallet_id are required' }, { status: 400 })
    }

    if (!['weekly', 'monthly', 'yearly'].includes(period)) {
      return NextResponse.json({ error: 'Period must be weekly, monthly, or yearly' }, { status: 400 })
    }

    // Validate wallet access using authenticated client (RLS enforced)
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id')
      .eq('id', wallet_id)
      .single()

    if (walletError || !wallet) {
      console.error('Wallet access denied:', walletError)
      return NextResponse.json({ error: 'Invalid wallet' }, { status: 400 })
    }

    const { data: budget, error } = await supabase
      .from('budgets')
      .insert({
        name,
        amount,
        period,
        category_id: category_id || null,
        wallet_id,
        user_id: user.id,
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
      return NextResponse.json({ error: 'Failed to create budget' }, { status: 500 })
    }

    return NextResponse.json({ budget }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
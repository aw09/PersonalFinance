import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

export async function GET(request: NextRequest) {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

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
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, amount, period = 'monthly', category_id, wallet_id, start_date, end_date } = body

    if (!name || !amount || !wallet_id) {
      return NextResponse.json({ 
        error: 'Name, amount, and wallet_id are required' 
      }, { status: 400 })
    }

    if (!['weekly', 'monthly', 'yearly'].includes(period)) {
      return NextResponse.json({ 
        error: 'Period must be weekly, monthly, or yearly' 
      }, { status: 400 })
    }

    // Validate that the wallet belongs to the user
    // First check if wallet exists at all
    const { data: walletCheck, error: walletCheckError } = await supabase
      .from('wallets')
      .select('id, owner_id')
      .eq('id', wallet_id)
      .single()

    if (walletCheckError || !walletCheck) {
      console.error('Wallet not found:', {
        wallet_id,
        walletCheckError
      })
      return NextResponse.json({ error: 'Wallet not found' }, { status: 400 })
    }

    // Check if wallet belongs to current user
    if (walletCheck.owner_id !== user.id) {
      console.error('Wallet ownership mismatch:', {
        wallet_id,
        wallet_owner_id: walletCheck.owner_id,
        current_user_id: user.id
      })
      return NextResponse.json({ error: 'Invalid wallet - not owned by user' }, { status: 400 })
    }

    const wallet = walletCheck

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
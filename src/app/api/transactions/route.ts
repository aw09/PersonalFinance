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
    const { searchParams } = new URL(request.url)
    const walletId = searchParams.get('wallet_id')
    const limit = parseInt(searchParams.get('limit') || '10')

    let query = supabase
      .from('transactions')
      .select(`
        *,
        categories (name, color, icon),
        wallets (name, currency)
      `)
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(limit)

    if (walletId) {
      query = query.eq('wallet_id', walletId)
    }

    const { data: transactions, error } = await query

    if (error) {
      console.error('Error fetching transactions:', error)
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    }

    return NextResponse.json({ transactions })
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
    const { amount, description, type, category_id, wallet_id, date } = body

    if (!amount || !description || !type || !wallet_id) {
      return NextResponse.json({ 
        error: 'Amount, description, type, and wallet_id are required' 
      }, { status: 400 })
    }

    if (!['income', 'expense', 'transfer'].includes(type)) {
      return NextResponse.json({ 
        error: 'Type must be income, expense, or transfer' 
      }, { status: 400 })
    }

    // Validate that the wallet belongs to the user
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id')
      .eq('id', wallet_id)
      .eq('owner_id', user.id)
      .single()

    if (walletError || !wallet) {
      return NextResponse.json({ error: 'Invalid wallet' }, { status: 400 })
    }

    // For expenses, make amount negative
    const finalAmount = type === 'expense' ? -Math.abs(amount) : Math.abs(amount)

    const { data: transaction, error } = await supabase
      .from('transactions')
      .insert({
        amount: finalAmount,
        description,
        type,
        category_id: category_id || null,
        wallet_id,
        user_id: user.id,
        date: date || new Date().toISOString()
      })
      .select(`
        *,
        categories (name, color, icon),
        wallets (name, currency)
      `)
      .single()

    if (error) {
      console.error('Error creating transaction:', error)
      return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
    }

    return NextResponse.json({ transaction }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
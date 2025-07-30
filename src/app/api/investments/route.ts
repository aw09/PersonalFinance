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
    const { data: investments, error } = await supabase
      .from('investments')
      .select(`
        *,
        wallets (name, currency)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching investments:', error)
      return NextResponse.json({ error: 'Failed to fetch investments' }, { status: 500 })
    }

    return NextResponse.json({ investments })
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
    const { name, type, initial_amount, current_value, quantity, wallet_id, purchase_date } = body

    if (!name || !type || !initial_amount || !current_value || !wallet_id) {
      return NextResponse.json({ 
        error: 'Name, type, initial_amount, current_value, and wallet_id are required' 
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

    const { data: investment, error } = await supabase
      .from('investments')
      .insert({
        name,
        type,
        initial_amount,
        current_value,
        quantity: quantity || null,
        wallet_id,
        user_id: user.id,
        purchase_date: purchase_date || new Date().toISOString()
      })
      .select(`
        *,
        wallets (name, currency)
      `)
      .single()

    if (error) {
      console.error('Error creating investment:', error)
      return NextResponse.json({ error: 'Failed to create investment' }, { status: 500 })
    }

    return NextResponse.json({ investment }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
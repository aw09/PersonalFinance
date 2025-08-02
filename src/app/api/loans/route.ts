import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

export async function GET(request: NextRequest) {
  // Get the authorization header
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  
  // Create Supabase client with the user's session token
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  )

  // Verify the user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  try {
    const { data: loans, error } = await supabase
      .from('loans')
      .select(`
        *,
        wallet:wallets(name, currency)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching loans:', error)
      return NextResponse.json({ error: 'Failed to fetch loans' }, { status: 500 })
    }

    return NextResponse.json({ loans })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Get the authorization header
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  
  // Create Supabase client with the user's session token
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  )

  // Verify the user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { 
      name, 
      principal_amount, 
      interest_rate, 
      type, 
      debtor_creditor, 
      wallet_id, 
      due_date 
    } = body

    if (!name || !principal_amount || !type || !wallet_id) {
      return NextResponse.json({ 
        error: 'Name, principal amount, type, and wallet are required' 
      }, { status: 400 })
    }

    // Verify wallet belongs to user
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id')
      .eq('id', wallet_id)
      .eq('owner_id', user.id)
      .single()

    if (walletError || !wallet) {
      return NextResponse.json({ error: 'Invalid wallet' }, { status: 400 })
    }

    const { data: loan, error } = await supabase
      .from('loans')
      .insert({
        name,
        principal_amount,
        remaining_amount: principal_amount, // Initially same as principal
        interest_rate: interest_rate || null,
        type,
        debtor_creditor: debtor_creditor || null,
        wallet_id,
        user_id: user.id,
        due_date: due_date || null
      })
      .select(`
        *,
        wallet:wallets(name, currency)
      `)
      .single()

    if (error) {
      console.error('Error creating loan:', error)
      return NextResponse.json({ error: 'Failed to create loan' }, { status: 500 })
    }

    return NextResponse.json({ loan }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
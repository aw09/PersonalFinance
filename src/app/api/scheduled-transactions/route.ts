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
    const { data: scheduledTransactions, error } = await supabase
      .from('scheduled_transactions')
      .select(`
        *,
        category:categories(id, name, color, icon),
        wallet:wallets(id, name, currency)
      `)
      .eq('user_id', user.id)
      .order('next_execution_date', { ascending: true })

    if (error) {
      console.error('Error fetching scheduled transactions:', error)
      return NextResponse.json({ error: 'Failed to fetch scheduled transactions' }, { status: 500 })
    }

    return NextResponse.json({ scheduledTransactions })
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
      amount, 
      description, 
      type, 
      category_id, 
      wallet_id, 
      frequency,
      next_execution_date,
      is_active = true
    } = body

    if (!amount || !description || !type || !wallet_id || !frequency || !next_execution_date) {
      return NextResponse.json({ 
        error: 'Amount, description, type, wallet, frequency, and next execution date are required' 
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

    // Verify category belongs to user (if provided)
    if (category_id) {
      const { data: category, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('id', category_id)
        .eq('user_id', user.id)
        .single()

      if (categoryError || !category) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
      }
    }

    const { data: scheduledTransaction, error } = await supabase
      .from('scheduled_transactions')
      .insert({
        amount,
        description,
        type,
        category_id: category_id || null,
        wallet_id,
        user_id: user.id,
        frequency,
        next_execution_date,
        is_active
      })
      .select(`
        *,
        category:categories(id, name, color, icon),
        wallet:wallets(id, name, currency)
      `)
      .single()

    if (error) {
      console.error('Error creating scheduled transaction:', error)
      return NextResponse.json({ error: 'Failed to create scheduled transaction' }, { status: 500 })
    }

    return NextResponse.json({ scheduledTransaction }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
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
    const { id, is_active, next_execution_date } = body

    if (!id) {
      return NextResponse.json({ 
        error: 'Scheduled transaction ID is required' 
      }, { status: 400 })
    }

    // Verify scheduled transaction belongs to user
    const { data: existing, error: checkError } = await supabase
      .from('scheduled_transactions')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Invalid scheduled transaction' }, { status: 400 })
    }

    const updateData: any = {}
    if (typeof is_active === 'boolean') {
      updateData.is_active = is_active
    }
    if (next_execution_date) {
      updateData.next_execution_date = next_execution_date
    }

    const { data: scheduledTransaction, error } = await supabase
      .from('scheduled_transactions')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        category:categories(id, name, color, icon),
        wallet:wallets(id, name, currency)
      `)
      .single()

    if (error) {
      console.error('Error updating scheduled transaction:', error)
      return NextResponse.json({ error: 'Failed to update scheduled transaction' }, { status: 500 })
    }

    return NextResponse.json({ scheduledTransaction })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
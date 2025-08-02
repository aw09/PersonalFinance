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
    const url = new URL(request.url)
    const transactionId = url.searchParams.get('transaction_id')

    if (!transactionId) {
      return NextResponse.json({ 
        error: 'Transaction ID is required' 
      }, { status: 400 })
    }

    // Verify transaction belongs to user
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', transactionId)
      .eq('user_id', user.id)
      .single()

    if (transactionError || !transaction) {
      return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
    }

    const { data: transactionItems, error } = await supabase
      .from('transaction_items')
      .select(`
        *,
        transaction:transactions(
          id,
          description,
          amount,
          type
        )
      `)
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching transaction items:', error)
      return NextResponse.json({ error: 'Failed to fetch transaction items' }, { status: 500 })
    }

    return NextResponse.json({ transactionItems })
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
      transaction_id, 
      name, 
      quantity = 1, 
      unit_price, 
      notes 
    } = body

    if (!transaction_id || !name || !unit_price) {
      return NextResponse.json({ 
        error: 'Transaction ID, name, and unit price are required' 
      }, { status: 400 })
    }

    // Verify transaction belongs to user
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', transaction_id)
      .eq('user_id', user.id)
      .single()

    if (transactionError || !transaction) {
      return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
    }

    const total_price = parseFloat(quantity) * parseFloat(unit_price)

    const { data: transactionItem, error } = await supabase
      .from('transaction_items')
      .insert({
        transaction_id,
        name,
        quantity: parseFloat(quantity),
        unit_price: parseFloat(unit_price),
        total_price,
        notes: notes || null
      })
      .select(`
        *,
        transaction:transactions(
          id,
          description,
          amount,
          type
        )
      `)
      .single()

    if (error) {
      console.error('Error creating transaction item:', error)
      return NextResponse.json({ error: 'Failed to create transaction item' }, { status: 500 })
    }

    return NextResponse.json({ transactionItem }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
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
      id,
      name, 
      quantity, 
      unit_price, 
      notes 
    } = body

    if (!id || !name || !quantity || !unit_price) {
      return NextResponse.json({ 
        error: 'ID, name, quantity, and unit price are required' 
      }, { status: 400 })
    }

    // Verify transaction item belongs to user's transaction
    const { data: existingItem, error: checkError } = await supabase
      .from('transaction_items')
      .select(`
        id,
        transaction:transactions!inner(user_id)
      `)
      .eq('id', id)
      .eq('transaction.user_id', user.id)
      .single()

    if (checkError || !existingItem) {
      return NextResponse.json({ error: 'Invalid transaction item' }, { status: 400 })
    }

    const total_price = parseFloat(quantity) * parseFloat(unit_price)

    const { data: transactionItem, error } = await supabase
      .from('transaction_items')
      .update({
        name,
        quantity: parseFloat(quantity),
        unit_price: parseFloat(unit_price),
        total_price,
        notes: notes || null
      })
      .eq('id', id)
      .select(`
        *,
        transaction:transactions(
          id,
          description,
          amount,
          type
        )
      `)
      .single()

    if (error) {
      console.error('Error updating transaction item:', error)
      return NextResponse.json({ error: 'Failed to update transaction item' }, { status: 500 })
    }

    return NextResponse.json({ transactionItem })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
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
    const url = new URL(request.url)
    const id = url.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ 
        error: 'Transaction item ID is required' 
      }, { status: 400 })
    }

    // Verify transaction item belongs to user's transaction
    const { data: existingItem, error: checkError } = await supabase
      .from('transaction_items')
      .select(`
        id,
        transaction:transactions!inner(user_id)
      `)
      .eq('id', id)
      .eq('transaction.user_id', user.id)
      .single()

    if (checkError || !existingItem) {
      return NextResponse.json({ error: 'Invalid transaction item' }, { status: 400 })
    }

    const { error } = await supabase
      .from('transaction_items')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting transaction item:', error)
      return NextResponse.json({ error: 'Failed to delete transaction item' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Transaction item deleted successfully' })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
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
    const loanId = url.searchParams.get('loan_id')

    let query = supabase
      .from('installments')
      .select(`
        *,
        loan:loans!inner(
          id,
          name,
          type,
          user_id,
          wallet:wallets(name, currency)
        )
      `)

    if (loanId) {
      query = query.eq('loan_id', loanId)
    }

    // Ensure user can only see their own installments
    query = query.eq('loan.user_id', user.id)
    query = query.order('due_date', { ascending: true })

    const { data: installments, error } = await query

    if (error) {
      console.error('Error fetching installments:', error)
      return NextResponse.json({ error: 'Failed to fetch installments' }, { status: 500 })
    }

    return NextResponse.json({ installments })
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
      loan_id, 
      amount, 
      due_date,
      status = 'pending'
    } = body

    if (!loan_id || !amount || !due_date) {
      return NextResponse.json({ 
        error: 'Loan ID, amount, and due date are required' 
      }, { status: 400 })
    }

    // Verify loan belongs to user
    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .select('id, name')
      .eq('id', loan_id)
      .eq('user_id', user.id)
      .single()

    if (loanError || !loan) {
      return NextResponse.json({ error: 'Invalid loan' }, { status: 400 })
    }

    const { data: installment, error } = await supabase
      .from('installments')
      .insert({
        loan_id,
        amount,
        due_date,
        status
      })
      .select(`
        *,
        loan:loans(
          id,
          name,
          type,
          wallet:wallets(name, currency)
        )
      `)
      .single()

    if (error) {
      console.error('Error creating installment:', error)
      return NextResponse.json({ error: 'Failed to create installment' }, { status: 500 })
    }

    return NextResponse.json({ installment }, { status: 201 })
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
    const { id, status, paid_date } = body

    if (!id || !status) {
      return NextResponse.json({ 
        error: 'Installment ID and status are required' 
      }, { status: 400 })
    }

    // Verify installment belongs to user's loan
    const { data: existingInstallment, error: checkError } = await supabase
      .from('installments')
      .select(`
        id,
        loan:loans!inner(user_id)
      `)
      .eq('id', id)
      .eq('loan.user_id', user.id)
      .single()

    if (checkError || !existingInstallment) {
      return NextResponse.json({ error: 'Invalid installment' }, { status: 400 })
    }

    const updateData: any = { status }
    if (status === 'paid' && paid_date) {
      updateData.paid_date = paid_date
    }

    const { data: installment, error } = await supabase
      .from('installments')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        loan:loans(
          id,
          name,
          type,
          wallet:wallets(name, currency)
        )
      `)
      .single()

    if (error) {
      console.error('Error updating installment:', error)
      return NextResponse.json({ error: 'Failed to update installment' }, { status: 500 })
    }

    return NextResponse.json({ installment })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
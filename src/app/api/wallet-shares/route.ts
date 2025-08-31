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
    const walletId = url.searchParams.get('wallet_id')

    let query = supabase
      .from('wallet_shares')
      .select(`
        *,
        wallet:wallets!inner(
          id,
          name,
          currency,
          owner_id
        ),
        user:profiles!wallet_shares_user_id_fkey(
          id,
          email,
          full_name
        )
      `)

    if (walletId) {
      query = query.eq('wallet_id', walletId)
    }

    // User can see shares where they are either the wallet owner or a shared user
    query = query.or(`user_id.eq.${user.id},wallet.owner_id.eq.${user.id}`)

    const { data: walletShares, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching wallet shares:', error)
      return NextResponse.json({ error: 'Failed to fetch wallet shares' }, { status: 500 })
    }

    return NextResponse.json({ walletShares })
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
    const { wallet_id, user_email, permission = 'read' } = body

    if (!wallet_id || !user_email) {
      return NextResponse.json({ 
        error: 'Wallet ID and user email are required' 
      }, { status: 400 })
    }

    // Verify wallet belongs to user (only owner can share)
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, name')
      .eq('id', wallet_id)
      .eq('owner_id', user.id)
      .single()

    if (walletError || !wallet) {
      return NextResponse.json({ error: 'Invalid wallet or insufficient permissions' }, { status: 400 })
    }

    // Find the user by email
    const { data: targetUser, error: userError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('email', user_email.toLowerCase().trim())
      .single()

    if (userError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Cannot share with yourself
    if (targetUser.id === user.id) {
      return NextResponse.json({ error: 'Cannot share wallet with yourself' }, { status: 400 })
    }

    // Check if sharing already exists
    const { data: existingShare } = await supabase
      .from('wallet_shares')
      .select('id')
      .eq('wallet_id', wallet_id)
      .eq('user_id', targetUser.id)
      .single()

    if (existingShare) {
      return NextResponse.json({ error: 'Wallet is already shared with this user' }, { status: 400 })
    }

    const { data: walletShare, error } = await supabase
      .from('wallet_shares')
      .insert({
        wallet_id,
        user_id: targetUser.id,
        permission
      })
      .select(`
        *,
        wallet:wallets(id, name, currency),
        user:profiles!wallet_shares_user_id_fkey(id, email, full_name)
      `)
      .single()

    if (error) {
      console.error('Error creating wallet share:', error)
      return NextResponse.json({ error: 'Failed to create wallet share' }, { status: 500 })
    }

    return NextResponse.json({ walletShare }, { status: 201 })
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
    const { id, permission } = body

    if (!id || !permission) {
      return NextResponse.json({ 
        error: 'Share ID and permission are required' 
      }, { status: 400 })
    }

    // Verify user owns the wallet for this share
    const { data: existingShare, error: checkError } = await supabase
      .from('wallet_shares')
      .select(`
        id,
        wallet:wallets!inner(owner_id)
      `)
      .eq('id', id)
      .eq('wallet.owner_id', user.id)
      .single()

    if (checkError || !existingShare) {
      return NextResponse.json({ error: 'Invalid wallet share or insufficient permissions' }, { status: 400 })
    }

    const { data: walletShare, error } = await supabase
      .from('wallet_shares')
      .update({ permission })
      .eq('id', id)
      .select(`
        *,
        wallet:wallets(id, name, currency),
        user:profiles!wallet_shares_user_id_fkey(id, email, full_name)
      `)
      .single()

    if (error) {
      console.error('Error updating wallet share:', error)
      return NextResponse.json({ error: 'Failed to update wallet share' }, { status: 500 })
    }

    return NextResponse.json({ walletShare })
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
        error: 'Share ID is required' 
      }, { status: 400 })
    }

    // Verify user owns the wallet for this share OR is the shared user (can remove themselves)
    const { data: existingShare, error: checkError } = await supabase
      .from('wallet_shares')
      .select(`
        id,
        user_id,
        wallet:wallets!inner(owner_id)
      `)
      .eq('id', id)
      .or(`wallet.owner_id.eq.${user.id},user_id.eq.${user.id}`)
      .single()

    if (checkError || !existingShare) {
      return NextResponse.json({ error: 'Invalid wallet share or insufficient permissions' }, { status: 400 })
    }

    const { error } = await supabase
      .from('wallet_shares')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting wallet share:', error)
      return NextResponse.json({ error: 'Failed to delete wallet share' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Wallet share deleted successfully' })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
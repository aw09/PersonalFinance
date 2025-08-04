
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/types/database';

export async function GET(request: NextRequest) {
  const { getSupabaseUser, createAuthSupabase, getAuthToken } = await import('@/lib/authSupabase');
  const user = await getSupabaseUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Invalid or missing token' }, { status: 401 });
  }
  const token = getAuthToken(request)!;
  const supabase = createAuthSupabase(token);

  try {
    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching wallets:', error);
      return NextResponse.json({ error: 'Failed to fetch wallets' }, { status: 500 });
    }

    return NextResponse.json({ wallets });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    const body = await request.json();
    const { name, description, currency = 'USD' } = body;

    if (!name) {
      return NextResponse.json({ error: 'Wallet name is required' }, { status: 400 });
    }

    // Ensure the user profile exists before creating wallet
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    // If profile doesn't exist, create it
    if (!existingProfile) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || null
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
      }
    }

    const { data: wallet, error } = await supabase
      .from('wallets')
      .insert({
        name,
        description,
        currency,
        owner_id: user.id
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating wallet:', error);
      return NextResponse.json({ error: 'Failed to create wallet' }, { status: 500 });
    }

    return NextResponse.json({ wallet }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
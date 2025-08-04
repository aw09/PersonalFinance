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
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching categories:', error);
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    return NextResponse.json({ categories });
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
    const { name, type, color = '#6B7280', icon } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
    }

    if (!['income', 'expense'].includes(type)) {
      return NextResponse.json({ error: 'Type must be income or expense' }, { status: 400 });
    }

    const { data: category, error } = await supabase
      .from('categories')
      .insert({
        name,
        type,
        color,
        icon,
        user_id: user.id
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating category:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Category with this name already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
    }

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
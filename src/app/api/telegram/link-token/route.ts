import { NextRequest, NextResponse } from 'next/server';
import { createLinkToken } from '@/lib/telegramAuth';

export async function POST(request: NextRequest) {
  const { getSupabaseUser } = await import('@/lib/authSupabase');
  const user = await getSupabaseUser(request);
  
  if (!user) {
    return NextResponse.json({ error: 'Invalid or missing token' }, { status: 401 });
  }

  try {
    const token = await createLinkToken(user.id);
    
    if (!token) {
      return NextResponse.json({ error: 'Failed to create link token' }, { status: 500 });
    }

    return NextResponse.json({ 
      token: token.token,
      expires_at: token.expires_at
    });
  } catch (error) {
    console.error('Error creating link token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { createLinkToken } from '@/lib/telegramAuth';

export async function POST(request: NextRequest) {
  // Check if environment variables are configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ 
      error: 'Server configuration error',
      details: 'Supabase environment variables are not configured. Please check your .env.local file.'
    }, { status: 500 });
  }

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
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
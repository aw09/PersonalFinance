import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

export function createAuthSupabase(token: string) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
}

// Helper to extract Bearer token from NextRequest
import { NextRequest } from 'next/server';
export function getAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.replace('Bearer ', '');
}

// Helper to get user from NextRequest: extracts token, creates client, returns user or null
export async function getSupabaseUser(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return null;
  const supabase = createAuthSupabase(token);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

// Create a Supabase client with service role for telegram operations
export function createTelegramSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for Telegram bot operations');
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Get user by telegram_user_id
export async function getTelegramUser(telegramUserId: number) {
  const supabase = createTelegramSupabase();
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching telegram user:', error);
    return null;
  }

  return profile;
}

// Create or update telegram session
export async function setTelegramSession(
  telegramUserId: number,
  telegramChatId: number,
  sessionData: any = {},
  currentStep?: string
) {
  const supabase = createTelegramSupabase();
  
  const { data, error } = await supabase
    .from('telegram_sessions')
    .upsert({
      telegram_user_id: telegramUserId,
      telegram_chat_id: telegramChatId,
      session_data: sessionData,
      current_step: currentStep,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'telegram_user_id'
    })
    .select()
    .single();

  if (error) {
    console.error('Error setting telegram session:', error);
    return null;
  }

  return data;
}

// Get telegram session
export async function getTelegramSession(telegramUserId: number) {
  const supabase = createTelegramSupabase();
  
  const { data: session, error } = await supabase
    .from('telegram_sessions')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching telegram session:', error);
    return null;
  }

  return session;
}

// Clear telegram session
export async function clearTelegramSession(telegramUserId: number) {
  const supabase = createTelegramSupabase();
  
  const { error } = await supabase
    .from('telegram_sessions')
    .delete()
    .eq('telegram_user_id', telegramUserId);

  if (error) {
    console.error('Error clearing telegram session:', error);
  }
}

// Create account linking token
export async function createLinkToken(userId: string) {
  const supabase = createTelegramSupabase();
  const token = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  const { data, error } = await supabase
    .from('telegram_link_tokens')
    .insert({
      user_id: userId,
      token,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating link token:', error);
    return null;
  }

  return data;
}

// Link telegram account using token
export async function linkTelegramAccount(
  token: string,
  telegramUserId: number,
  telegramChatId: number,
  telegramUsername?: string
) {
  const supabase = createTelegramSupabase();
  
  // Find and validate token
  const { data: linkToken, error: tokenError } = await supabase
    .from('telegram_link_tokens')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .is('used_at', null)
    .single();

  if (tokenError || !linkToken) {
    return { success: false, error: 'Invalid or expired token' };
  }

  // Check if telegram account is already linked
  const existingUser = await getTelegramUser(telegramUserId);
  if (existingUser) {
    return { success: false, error: 'This Telegram account is already linked to another user' };
  }

  // Update user profile with telegram info
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      telegram_user_id: telegramUserId,
      telegram_chat_id: telegramChatId,
      telegram_username: telegramUsername,
      telegram_linked_at: new Date().toISOString()
    })
    .eq('id', linkToken.user_id);

  if (profileError) {
    console.error('Error linking telegram account:', profileError);
    return { success: false, error: 'Failed to link account' };
  }

  // Mark token as used
  await supabase
    .from('telegram_link_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', linkToken.id);

  return { success: true };
}

// Cleanup expired data
export async function cleanupExpiredTelegramData() {
  const supabase = createTelegramSupabase();
  
  try {
    await supabase.rpc('cleanup_expired_telegram_data');
  } catch (error) {
    console.error('Error cleaning up expired telegram data:', error);
  }
}
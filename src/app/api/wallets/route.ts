
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/types/database';
import { withAuth, createErrorResponse, createSuccessResponse, withErrorHandling, AuthenticatedRequest } from '@/lib/apiMiddleware';

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { data: wallets, error } = await request.supabase
      .from('wallets')
      .select('*')
      .eq('owner_id', request.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching wallets:', error);
      return createErrorResponse('Failed to fetch wallets');
    }

    return createSuccessResponse({ wallets });
  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse('Internal server error');
  }
});

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json();
    const { name, description, currency = 'USD' } = body;

    if (!name) {
      return createErrorResponse('Wallet name is required', 400);
    }

    // Ensure the user profile exists before creating wallet
    const { data: existingProfile } = await request.supabase
      .from('profiles')
      .select('id')
      .eq('id', request.user.id)
      .single();

    // If profile doesn't exist, create it
    if (!existingProfile) {
      const { error: profileError } = await request.supabase
        .from('profiles')
        .insert({
          id: request.user.id,
          email: request.user.email || '',
          full_name: request.user.user_metadata?.full_name || null
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        return createErrorResponse('Failed to create user profile');
      }
    }

    const { data: wallet, error } = await request.supabase
      .from('wallets')
      .insert({
        name,
        description,
        currency,
        owner_id: request.user.id
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating wallet:', error);
      return createErrorResponse('Failed to create wallet');
    }

    return createSuccessResponse({ wallet }, 201);
  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse('Internal server error');
  }
});
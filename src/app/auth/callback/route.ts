import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  // Use NEXT_PUBLIC_SITE_URL if available for consistent origin handling
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  
  // Determine the correct origin for redirects
  let origin;
  if (siteUrl) {
    // Use the configured site URL (recommended for production)
    origin = siteUrl;
  } else {
    // Fallback to request origin (works locally but may fail in some deployments)
    origin = new URL(request.url).origin;
  }
  
  console.log(`Auth callback processing with origin: ${origin}`);
  
  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      const redirectUrl = `${origin}/dashboard`;
      console.log(`Successful auth, redirecting to: ${redirectUrl}`);
      return NextResponse.redirect(redirectUrl);
    } else {
      console.error(`Auth error: ${error.message}`);
    }
  }

  // If there's an error or no code, redirect to home
  const homeUrl = `${origin}/`;
  console.log(`Auth failed or no code, redirecting to: ${homeUrl}`);
  return NextResponse.redirect(homeUrl)
}
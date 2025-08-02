#!/usr/bin/env node

/**
 * Environment validation script for Railway deployment
 * Run this before starting the server to catch missing variables early
 */

const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

const optionalEnvVars = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY',
];

function validateEnvironment() {
  const missing = [];
  const warnings = [];

  // Check required environment variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  // Check optional environment variables
  for (const envVar of optionalEnvVars) {
    if (!process.env[envVar]) {
      warnings.push(envVar);
    }
  }

  // Log warnings for optional variables
  if (warnings.length > 0) {
    console.warn('⚠️  Optional environment variables not set:', warnings.join(', '));
    console.warn('   Some features may not work properly.');
  }

  // Throw error for missing required variables
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('   Please set these variables in your Railway project settings.');
    console.error('   Visit: https://railway.app/project/[your-project]/variables');
    process.exit(1);
  }

  console.log('✅ Environment variables validated successfully');
}

// Only validate in production
if (process.env.NODE_ENV === 'production') {
  validateEnvironment();
}
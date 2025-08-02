import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

// Use placeholders for static build time, but these will be replaced at runtime
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-build-time-only.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-build-time-only'

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null

// Create a function to get or initialize the Supabase client
const getSupabaseClient = () => {
  // For SSR (server-side rendering), always create a new instance
  if (typeof window === 'undefined') {
    return createClient<Database>(supabaseUrl, supabaseAnonKey)
  }

  // For client-side, check if we need to re-initialize with runtime values
  if (!supabaseInstance) {
    // Get runtime values from window.__env if available (set by _document.js)
    const runtimeUrl = 
      // @ts-ignore - custom property added at runtime
      window.__env?.NEXT_PUBLIC_SUPABASE_URL || 
      process.env.NEXT_PUBLIC_SUPABASE_URL || 
      supabaseUrl
      
    const runtimeKey = 
      // @ts-ignore - custom property added at runtime  
      window.__env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
      supabaseAnonKey

    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Initializing Supabase client with URL:', runtimeUrl)
    }

    // Create the client
    supabaseInstance = createClient<Database>(runtimeUrl, runtimeKey)
  }

  return supabaseInstance
}

// Export the client
export const supabase = getSupabaseClient()
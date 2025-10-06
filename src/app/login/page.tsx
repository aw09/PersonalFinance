'use client'

import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import AuthComponent from '@/components/auth/AuthComponent'
import ThemeToggle from '@/components/ui/ThemeToggle'
import Link from 'next/link'

export default function LoginPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
        
        // Redirect to dashboard on sign in
        if (event === 'SIGNED_IN' && session?.user) {
          window.location.href = '/dashboard'
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner h-12 w-12 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // If user is authenticated, redirect to dashboard
  if (user) {
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard'
    }
    return null
  }

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="nav sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex-shrink-0">
                <h1 className="text-xl font-bold text-gradient">Personal Finance</h1>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                Home
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

      {/* Login Section */}
      <section className="py-20 lg:py-32">
        <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Sign In to Your Account
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Access your personal finance dashboard
            </p>
          </div>
          <AuthComponent />
          <div className="text-center mt-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Don&apos;t have an account? The form above works for both sign in and sign up.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400">
              © 2024 Personal Finance. Built with ❤️ for better financial management.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
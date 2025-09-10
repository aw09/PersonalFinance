'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TelegramLinkComponent() {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)

  const generateLinkToken = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const supabaseClient = supabase
      const { data: { session } } = await supabaseClient.auth.getSession()
      
      if (!session) {
        setError('Please log in to link your Telegram account')
        return
      }

      const response = await fetch('/api/telegram/link-token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setLinkToken(data.token)
        setExpiresAt(data.expires_at)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to generate link token')
      }
    } catch (err) {
      setError('An error occurred while generating the link token')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    if (linkToken) {
      try {
        await navigator.clipboard.writeText(linkToken)
        // Could add a toast notification here
      } catch (err) {
        console.error('Failed to copy:', err)
      }
    }
  }

  return (
    <div className="card max-w-md mx-auto">
      <div className="card-body">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
          <span className="mr-2">🔗</span>
          Link Telegram Account
        </h3>
        
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Connect your Telegram account to manage your finances directly from Telegram.
          </p>

        {!linkToken ? (
          <button
            onClick={generateLinkToken}
            disabled={loading}
            className="w-full btn-primary"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-gray-50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </span>
            ) : (
              'Generate Link Token'
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">Link Token</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-mono tracking-wider">{linkToken}</p>
                  {expiresAt && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Expires: {new Date(expiresAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={copyToClipboard}
                  className="ml-2 p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  title="Copy to clipboard"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-primary-900 dark:text-primary-100 mb-2">Next Steps:</h4>
              <ol className="text-sm text-primary-700 dark:text-primary-300 space-y-1">
                <li>1. Open Telegram and find the Personal Finance bot</li>
                <li>2. Send the command <code className="bg-primary-100 dark:bg-primary-800 px-1 rounded">/start</code></li>
                <li>3. Click &ldquo;Link Account&rdquo; in the menu</li>
                <li>4. Send the 6-digit code: <strong className="font-mono">{linkToken}</strong></li>
              </ol>
            </div>

            <button
              onClick={() => {
                setLinkToken(null)
                setExpiresAt(null)
              }}
              className="w-full btn-secondary"
            >
              Generate New Token
            </button>
          </div>
        )}

        {error && (
          <div className="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-lg p-3">
            <p className="text-sm text-danger-700 dark:text-danger-300">{error}</p>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
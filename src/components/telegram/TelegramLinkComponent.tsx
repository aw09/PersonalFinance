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
    <div className="bg-white p-6 rounded-lg shadow-md max-w-md mx-auto">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <span className="mr-2">🔗</span>
        Link Telegram Account
      </h3>
      
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Connect your Telegram account to manage your finances directly from Telegram.
        </p>

        {!linkToken ? (
          <button
            onClick={generateLinkToken}
            disabled={loading}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
            <div className="bg-gray-50 p-4 rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Link Token</p>
                  <p className="text-2xl font-bold text-gray-900 font-mono tracking-wider">{linkToken}</p>
                  {expiresAt && (
                    <p className="text-xs text-gray-500 mt-1">
                      Expires: {new Date(expiresAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={copyToClipboard}
                  className="ml-2 p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  title="Copy to clipboard"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Next Steps:</h4>
              <ol className="text-sm text-blue-700 space-y-1">
                <li>1. Open Telegram and find the Personal Finance bot</li>
                <li>2. Send the command <code className="bg-blue-100 px-1 rounded">/start</code></li>
                <li>3. Click &ldquo;Link Account&rdquo; in the menu</li>
                <li>4. Send the 6-digit code: <strong className="font-mono">{linkToken}</strong></li>
              </ol>
            </div>

            <button
              onClick={() => {
                setLinkToken(null)
                setExpiresAt(null)
              }}
              className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Generate New Token
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
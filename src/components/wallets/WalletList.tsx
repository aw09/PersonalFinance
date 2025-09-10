'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database'
import CreateWalletModal from './CreateWalletModal'

type Wallet = Database['public']['Tables']['wallets']['Row']

export default function WalletList() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const fetchWallets = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        setWallets([])
        setLoading(false)
        return
      }

      const response = await fetch('/api/wallets', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch wallets')
      }

      const data = await response.json()
      setWallets(data.wallets || [])
    } catch (error) {
      console.error('Error fetching wallets:', error)
      setWallets([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWallets()
  }, [])

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount)
  }

  const handleWalletCreated = () => {
    fetchWallets() // Refresh the list
  }

  if (loading) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <div className="card-body">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">My Wallets</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              Add Wallet
            </button>
          </div>

          {wallets.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 dark:text-gray-400 mb-4">
                <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              No wallets created yet
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Create your first wallet to start tracking your finances!
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              Create Your First Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {wallets.map((wallet) => (
              <div key={wallet.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition bg-gray-50 dark:bg-gray-800/50">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">{wallet.name}</h3>
                    {wallet.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{wallet.description}</p>
                    )}
                    <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                      <span>Currency: {wallet.currency}</span>
                      <span>Created: {new Date(wallet.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(wallet.balance, wallet.currency)}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Balance</div>
                  </div>
                </div>
                
                <div className="mt-4 flex space-x-2">
                  <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                    View Transactions
                  </button>
                  <button className="text-green-600 hover:text-green-800 text-sm font-medium">
                    Add Transaction
                  </button>
                  <button className="text-gray-600 hover:text-gray-800 text-sm font-medium">
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      <CreateWalletModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onWalletCreated={handleWalletCreated}
      />
    </>
  )
}
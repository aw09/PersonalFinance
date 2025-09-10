'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Transaction {
  id: string
  amount: number
  description: string
  date: string
  type: 'income' | 'expense' | 'transfer'
  categories: {
    name: string
    color: string
    icon: string | null
  } | null
  wallets: {
    name: string
    currency: string
  }
}

interface TransactionListProps {
  limit?: number
  walletId?: string
  onAddTransaction?: () => void
}

export default function TransactionList({ limit = 10, walletId, onAddTransaction }: TransactionListProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTransactions = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        setTransactions([])
        setLoading(false)
        return
      }

      const params = new URLSearchParams({ limit: limit.toString() })
      if (walletId) params.append('wallet_id', walletId)

      const response = await fetch(`/api/transactions?${params}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch transactions')
      }

      const data = await response.json()
      setTransactions(data.transactions || [])
    } catch (error) {
      console.error('Error fetching transactions:', error)
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
  }, [limit, walletId])

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-body">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">
            {walletId ? 'Wallet Transactions' : 'Recent Transactions'}
          </h2>
          <div className="flex space-x-2">
            {onAddTransaction && (
              <button
                onClick={onAddTransaction}
                className="btn-primary btn-sm"
            >
              Add Transaction
            </button>
          )}
          <button className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 text-sm font-medium">
            View All
          </button>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-gray-500 dark:text-gray-400 mb-4">
            <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            No transactions yet
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Start by adding your first transaction!
          </p>
          {onAddTransaction && (
            <button
              onClick={onAddTransaction}
              className="btn-primary"
            >
              Add Your First Transaction
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((transaction) => (
            <div key={transaction.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition bg-gray-50 dark:bg-gray-800/50">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      {transaction.categories?.icon && (
                        <span className="text-2xl">{transaction.categories.icon}</span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{transaction.description}</h4>
                      <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                        {transaction.categories && (
                          <span 
                            className="px-2 py-1 rounded text-gray-50 dark:text-gray-100 text-xs font-medium"
                            style={{ backgroundColor: transaction.categories.color }}
                          >
                            {transaction.categories.name}
                          </span>
                        )}
                        <span>{transaction.wallets.name}</span>
                        <span>•</span>
                        <span>{formatDate(transaction.date)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div 
                    className={`text-lg font-bold ${
                      transaction.type === 'income' 
                        ? 'text-success-600 dark:text-success-400' 
                        : transaction.type === 'expense'
                        ? 'text-danger-600 dark:text-danger-400'
                        : 'text-primary-600 dark:text-primary-400'
                    }`}
                  >
                    {transaction.type === 'expense' ? '' : '+'}
                    {formatCurrency(Math.abs(transaction.amount), transaction.wallets.currency)}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                    {transaction.type}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
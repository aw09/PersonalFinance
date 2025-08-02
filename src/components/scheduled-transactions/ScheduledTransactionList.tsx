'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

interface ScheduledTransaction {
  id: string
  amount: number
  description: string
  type: 'income' | 'expense'
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  next_execution_date: string
  is_active: boolean
  created_at: string
  category: {
    id: string
    name: string
    color: string
    icon: string
  } | null
  wallet: {
    id: string
    name: string
    currency: string
  }
}

interface ScheduledTransactionListProps {
  refreshTrigger: number
}

export default function ScheduledTransactionList({ refreshTrigger }: ScheduledTransactionListProps) {
  const [scheduledTransactions, setScheduledTransactions] = useState<ScheduledTransaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchScheduledTransactions()
  }, [refreshTrigger])

  const fetchScheduledTransactions = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        setLoading(false)
        return
      }

      const response = await fetch('/api/scheduled-transactions', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const { scheduledTransactions } = await response.json()
        setScheduledTransactions(scheduledTransactions)
      }
    } catch (error) {
      console.error('Error fetching scheduled transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) return

      const response = await fetch('/api/scheduled-transactions', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          id,
          is_active: !currentActive
        })
      })

      if (response.ok) {
        await fetchScheduledTransactions()
      }
    } catch (error) {
      console.error('Error updating scheduled transaction:', error)
    }
  }

  const getTypeColor = (type: string) => {
    return type === 'income' 
      ? 'text-green-600 bg-green-100' 
      : 'text-red-600 bg-red-100'
  }

  const getFrequencyLabel = (frequency: string) => {
    return frequency.charAt(0).toUpperCase() + frequency.slice(1)
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    )
  }

  if (scheduledTransactions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <div className="text-gray-500 text-lg mb-2">No scheduled transactions found</div>
        <div className="text-gray-400">Create your first scheduled transaction to automate your finances</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Scheduled Transactions</h3>
      </div>
      
      <div className="divide-y divide-gray-200">
        {scheduledTransactions.map((transaction) => (
          <div key={transaction.id} className="p-6 hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <h4 className="text-lg font-medium text-gray-900">{transaction.description}</h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(transaction.type)}`}>
                    {transaction.type}
                  </span>
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                    {getFrequencyLabel(transaction.frequency)}
                  </span>
                  <button
                    onClick={() => toggleActive(transaction.id, transaction.is_active)}
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      transaction.is_active 
                        ? 'bg-green-100 text-green-600' 
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {transaction.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
                
                <div className="mt-2 flex items-center space-x-6 text-sm text-gray-500">
                  <div>
                    <span className="font-medium">Amount:</span> {formatCurrency(transaction.amount, transaction.wallet.currency)}
                  </div>
                  <div>
                    <span className="font-medium">Wallet:</span> {transaction.wallet.name}
                  </div>
                  {transaction.category && (
                    <div>
                      <span className="font-medium">Category:</span> {transaction.category.icon} {transaction.category.name}
                    </div>
                  )}
                </div>

                <div className="mt-2 flex items-center space-x-6 text-sm text-gray-500">
                  <div>
                    <span className="font-medium">Next execution:</span> {format(new Date(transaction.next_execution_date), 'MMM dd, yyyy HH:mm')}
                  </div>
                  <div>
                    <span className="font-medium">Created:</span> {format(new Date(transaction.created_at), 'MMM dd, yyyy')}
                  </div>
                </div>
              </div>

              <div className="ml-4">
                <div className="text-right">
                  <div className={`text-lg font-medium ${
                    transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {transaction.type === 'income' ? '+' : '-'}
                    {formatCurrency(transaction.amount, transaction.wallet.currency)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {getFrequencyLabel(transaction.frequency)}
                  </div>
                </div>
              </div>
            </div>

            {/* Status indicator */}
            <div className="mt-4 flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                transaction.is_active ? 'bg-green-500' : 'bg-gray-400'
              }`}></div>
              <span className="text-sm text-gray-600">
                {transaction.is_active 
                  ? `Will execute ${getFrequencyLabel(transaction.frequency).toLowerCase()}` 
                  : 'Paused - will not execute'
                }
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
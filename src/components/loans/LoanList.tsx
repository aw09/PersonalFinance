'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

interface Loan {
  id: string
  name: string
  principal_amount: number
  remaining_amount: number
  interest_rate: number | null
  type: 'loan_given' | 'loan_taken' | 'credit'
  debtor_creditor: string | null
  due_date: string | null
  created_at: string
  wallet: {
    name: string
    currency: string
  }
}

interface LoanListProps {
  refreshTrigger: number
}

export default function LoanList({ refreshTrigger }: LoanListProps) {
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLoans()
  }, [refreshTrigger])

  const fetchLoans = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        setLoading(false)
        return
      }

      const response = await fetch('/api/loans', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const { loans } = await response.json()
        setLoans(loans)
      }
    } catch (error) {
      console.error('Error fetching loans:', error)
    } finally {
      setLoading(false)
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'loan_given': return 'text-green-600 bg-green-100'
      case 'loan_taken': return 'text-red-600 bg-red-100'
      case 'credit': return 'text-blue-600 bg-blue-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'loan_given': return 'Loan Given'
      case 'loan_taken': return 'Loan Taken'
      case 'credit': return 'Credit'
      default: return type
    }
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

  if (loans.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <div className="text-gray-500 text-lg mb-2">No loans found</div>
        <div className="text-gray-400">Create your first loan to get started</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Loans</h3>
      </div>
      
      <div className="divide-y divide-gray-200">
        {loans.map((loan) => (
          <div key={loan.id} className="p-6 hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <h4 className="text-lg font-medium text-gray-900">{loan.name}</h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(loan.type)}`}>
                    {getTypeLabel(loan.type)}
                  </span>
                </div>
                
                <div className="mt-2 flex items-center space-x-6 text-sm text-gray-500">
                  <div>
                    <span className="font-medium">Principal:</span> {formatCurrency(loan.principal_amount, loan.wallet.currency)}
                  </div>
                  <div>
                    <span className="font-medium">Remaining:</span> {formatCurrency(loan.remaining_amount, loan.wallet.currency)}
                  </div>
                  {loan.interest_rate && (
                    <div>
                      <span className="font-medium">Interest:</span> {loan.interest_rate}%
                    </div>
                  )}
                </div>

                <div className="mt-2 flex items-center space-x-6 text-sm text-gray-500">
                  <div>
                    <span className="font-medium">Wallet:</span> {loan.wallet.name}
                  </div>
                  {loan.debtor_creditor && (
                    <div>
                      <span className="font-medium">{loan.type === 'loan_given' ? 'Debtor' : 'Creditor'}:</span> {loan.debtor_creditor}
                    </div>
                  )}
                  {loan.due_date && (
                    <div>
                      <span className="font-medium">Due:</span> {format(new Date(loan.due_date), 'MMM dd, yyyy')}
                    </div>
                  )}
                </div>

                <div className="mt-2 text-xs text-gray-400">
                  Created on {format(new Date(loan.created_at), 'MMM dd, yyyy')}
                </div>
              </div>

              <div className="ml-4">
                <div className="text-right">
                  <div className="text-lg font-medium text-gray-900">
                    {formatCurrency(loan.remaining_amount, loan.wallet.currency)}
                  </div>
                  <div className="text-sm text-gray-500">remaining</div>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Repayment Progress</span>
                <span>{Math.round(((loan.principal_amount - loan.remaining_amount) / loan.principal_amount) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ 
                    width: `${Math.max(0, Math.min(100, ((loan.principal_amount - loan.remaining_amount) / loan.principal_amount) * 100))}%` 
                  }}
                ></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
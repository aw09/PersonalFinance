'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface CreateLoanModalProps {
  isOpen: boolean
  onClose: () => void
  onLoanCreated: () => void
}

interface Wallet {
  id: string
  name: string
  currency: string
}

export default function CreateLoanModal({ isOpen, onClose, onLoanCreated }: CreateLoanModalProps) {
  const [name, setName] = useState('')
  const [principalAmount, setPrincipalAmount] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [type, setType] = useState<'loan_given' | 'loan_taken' | 'credit'>('loan_taken')
  const [debtorCreditor, setDebtorCreditor] = useState('')
  const [walletId, setWalletId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchWallets()
    }
  }, [isOpen])

  const fetchWallets = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) return

      const response = await fetch('/api/wallets', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const { wallets } = await response.json()
        setWallets(wallets)
        if (wallets.length > 0) {
          setWalletId(wallets[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching wallets:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !principalAmount || !walletId) return

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('No authentication token')
      }

      const response = await fetch('/api/loans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          principal_amount: parseFloat(principalAmount),
          interest_rate: interestRate ? parseFloat(interestRate) : null,
          type,
          debtor_creditor: debtorCreditor.trim() || null,
          wallet_id: walletId,
          due_date: dueDate || null
        })
      })

      if (response.ok) {
        setName('')
        setPrincipalAmount('')
        setInterestRate('')
        setType('loan_taken')
        setDebtorCreditor('')
        setWalletId('')
        setDueDate('')
        onLoanCreated()
        onClose()
      } else {
        const error = await response.json()
        console.error('Error creating loan:', error)
      }
    } catch (error) {
      console.error('Error creating loan:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Create New Loan</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Loan Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Personal Loan, Credit Card"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Principal Amount *
            </label>
            <input
              type="number"
              step="0.01"
              value={principalAmount}
              onChange={(e) => setPrincipalAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type *
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="loan_taken">Loan Taken</option>
              <option value="loan_given">Loan Given</option>
              <option value="credit">Credit</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Interest Rate (%)
            </label>
            <input
              type="number"
              step="0.01"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Debtor/Creditor
            </label>
            <input
              type="text"
              value={debtorCreditor}
              onChange={(e) => setDebtorCreditor(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Person or institution name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Wallet *
            </label>
            <select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select a wallet</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} ({wallet.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={loading || !name.trim() || !principalAmount || !walletId}
            >
              {loading ? 'Creating...' : 'Create Loan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
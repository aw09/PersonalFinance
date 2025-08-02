'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface CreateScheduledTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onScheduledTransactionCreated: () => void
}

interface Wallet {
  id: string
  name: string
  currency: string
}

interface Category {
  id: string
  name: string
  color: string
  icon: string
  type: 'income' | 'expense'
}

export default function CreateScheduledTransactionModal({ 
  isOpen, 
  onClose, 
  onScheduledTransactionCreated 
}: CreateScheduledTransactionModalProps) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [categoryId, setCategoryId] = useState('')
  const [walletId, setWalletId] = useState('')
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')
  const [nextExecutionDate, setNextExecutionDate] = useState('')
  const [isActive, setIsActive] = useState(true)
  
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchData()
    }
  }, [isOpen])

  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) return

      // Fetch wallets and categories
      const [walletsResponse, categoriesResponse] = await Promise.all([
        fetch('/api/wallets', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        }),
        fetch('/api/categories', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        })
      ])

      if (walletsResponse.ok) {
        const { wallets } = await walletsResponse.json()
        setWallets(wallets)
        if (wallets.length > 0) {
          setWalletId(wallets[0].id)
        }
      }

      if (categoriesResponse.ok) {
        const { categories } = await categoriesResponse.json()
        setCategories(categories)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }

  const filteredCategories = categories.filter(cat => cat.type === type)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !description.trim() || !walletId || !nextExecutionDate) return

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('No authentication token')
      }

      const response = await fetch('/api/scheduled-transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          description: description.trim(),
          type,
          category_id: categoryId || null,
          wallet_id: walletId,
          frequency,
          next_execution_date: nextExecutionDate,
          is_active: isActive
        })
      })

      if (response.ok) {
        resetForm()
        onScheduledTransactionCreated()
        onClose()
      } else {
        const error = await response.json()
        console.error('Error creating scheduled transaction:', error)
      }
    } catch (error) {
      console.error('Error creating scheduled transaction:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setAmount('')
    setDescription('')
    setType('expense')
    setCategoryId('')
    setWalletId('')
    setFrequency('monthly')
    setNextExecutionDate('')
    setIsActive(true)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Create Scheduled Transaction</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount *
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Monthly rent, Weekly groceries"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type *
            </label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as 'income' | 'expense')
                setCategoryId('') // Reset category when type changes
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a category</option>
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon} {category.name}
                </option>
              ))}
            </select>
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
              Frequency *
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as any)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Next Execution Date *
            </label>
            <input
              type="datetime-local"
              value={nextExecutionDate}
              onChange={(e) => setNextExecutionDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
              Active (transaction will be processed automatically)
            </label>
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
              disabled={loading || !amount || !description.trim() || !walletId || !nextExecutionDate}
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
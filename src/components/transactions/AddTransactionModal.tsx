'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database'

type Wallet = Database['public']['Tables']['wallets']['Row']
type Category = Database['public']['Tables']['categories']['Row']

interface AddTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onTransactionAdded: () => void
}

export default function AddTransactionModal({ isOpen, onClose, onTransactionAdded }: AddTransactionModalProps) {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [categoryId, setCategoryId] = useState('')
  const [walletId, setWalletId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) return

      // Fetch wallets
      const walletsResponse = await fetch('/api/wallets', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      if (walletsResponse.ok) {
        const walletsData = await walletsResponse.json()
        setWallets(walletsData.wallets || [])
        if (walletsData.wallets?.length > 0 && !walletId) {
          setWalletId(walletsData.wallets[0].id)
        }
      }

      // Fetch categories
      const categoriesResponse = await fetch('/api/categories', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json()
        setCategories(categoriesData.categories || [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchData()
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !description || !walletId) return

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('No authentication token')
      }

      const response = await fetch('/api/transactions', {
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
          date: new Date(date).toISOString()
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create transaction')
      }

      // Reset form
      setAmount('')
      setDescription('')
      setType('expense')
      setCategoryId('')
      setDate(new Date().toISOString().split('T')[0])
      
      onTransactionAdded()
      onClose()
    } catch (error) {
      console.error('Error creating transaction:', error)
      alert(error instanceof Error ? error.message : 'Failed to create transaction')
    } finally {
      setLoading(false)
    }
  }

  const filteredCategories = categories.filter(cat => cat.type === type)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Add Transaction</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type *
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="expense"
                  checked={type === 'expense'}
                  onChange={(e) => {
                    setType(e.target.value as 'expense')
                    setCategoryId('')
                  }}
                  className="mr-2"
                />
                <span className="text-red-600">Expense</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="income"
                  checked={type === 'income'}
                  onChange={(e) => {
                    setType(e.target.value as 'income')
                    setCategoryId('')
                  }}
                  className="mr-2"
                />
                <span className="text-green-600">Income</span>
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
              Amount *
            </label>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
              step="0.01"
              min="0"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <input
              type="text"
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter transaction description"
              required
            />
          </div>

          <div>
            <label htmlFor="wallet" className="block text-sm font-medium text-gray-700 mb-1">
              Wallet *
            </label>
            <select
              id="wallet"
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              id="category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
              Date *
            </label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50"
              disabled={loading || !amount || !description || !walletId}
            >
              {loading ? 'Adding...' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database'

type Wallet = Database['public']['Tables']['wallets']['Row']
type Category = Database['public']['Tables']['categories']['Row']

interface CreateBudgetModalProps {
  isOpen: boolean
  onClose: () => void
  onBudgetCreated: () => void
}

export default function CreateBudgetModal({ isOpen, onClose, onBudgetCreated }: CreateBudgetModalProps) {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>('monthly')
  const [categoryId, setCategoryId] = useState('')
  const [walletId, setWalletId] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) return

      // Fetch wallets
      const walletsResponse = await fetch('/api/wallets', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      if (walletsResponse.ok) {
        const walletsData = await walletsResponse.json()
        const walletsList = walletsData.wallets || []
        setWallets(walletsList)
        if (walletsList.length > 0) {
          setWalletId(prev => prev || walletsList[0].id)
        }
      }

      // Fetch expense categories only
      const categoriesResponse = await fetch('/api/categories', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json()
        const expenseCategories = (categoriesData.categories || []).filter(
          (cat: Category) => cat.type === 'expense'
        )
        setCategories(expenseCategories)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchData()
    }
  }, [isOpen, fetchData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !amount || !walletId) return

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('No authentication token')
      }

      const response = await fetch('/api/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          amount: parseFloat(amount),
          period,
          category_id: categoryId || null,
          wallet_id: walletId,
          start_date: new Date(startDate).toISOString(),
          end_date: endDate ? new Date(endDate).toISOString() : null
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create budget')
      }

      // Reset form
      setName('')
      setAmount('')
      setPeriod('monthly')
      setCategoryId('')
      setStartDate(new Date().toISOString().split('T')[0])
      setEndDate('')
      
      onBudgetCreated()
      onClose()
    } catch (error) {
      console.error('Error creating budget:', error)
      alert(error instanceof Error ? error.message : 'Failed to create budget')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay flex items-center justify-center z-50">
      <div className="modal-content w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="card-header">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Create Budget</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="card-body space-y-4">
          <div>
            <label htmlFor="name" className="label">
              Budget Name *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g., Monthly Groceries, Entertainment"
              required
            />
          </div>

          <div>
            <label htmlFor="amount" className="label">
              Budget Amount *
            </label>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
              placeholder="0.00"
              step="0.01"
              min="0"
              required
            />
          </div>

          <div>
            <label htmlFor="period" className="label">
              Budget Period *
            </label>
            <select
              id="period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as 'weekly' | 'monthly' | 'yearly')}
              className="input"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div>
            <label htmlFor="wallet" className="label">
              Wallet *
            </label>
            <select
              id="wallet"
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="input"
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
            <label htmlFor="category" className="label">
              Category (Optional)
            </label>
            <select
              id="category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input"
            >
              <option value="">All Expenses</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon} {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="startDate" className="label">
              Start Date *
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label htmlFor="endDate" className="label">
              End Date (Optional)
            </label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
              min={startDate}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Leave empty for ongoing budget
            </p>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 btn-success"
              disabled={loading || !name || !amount || !walletId}
            >
              {loading ? 'Creating...' : 'Create Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
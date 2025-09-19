'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/types/database'
import { useWallets, useCategories, useApiPost } from '@/hooks/useApiData'
import { Modal, ModalBody } from '@/components/ui/Modal'

type Wallet = Database['public']['Tables']['wallets']['Row']
type Category = Database['public']['Tables']['categories']['Row']

interface CreateBudgetModalProps {
  isOpen: boolean
  onClose: () => void
  onBudgetCreated: () => void
}

interface BudgetFormData {
  name: string
  amount: number
  period: 'weekly' | 'monthly' | 'yearly'
  category_id: string | null
  wallet_id: string
  start_date: string
  end_date: string | null
}

/**
 * Budget form component responsible only for budget form UI
 * Implements Single Responsibility Principle
 */
function BudgetForm({ 
  onSubmit, 
  onCancel,
  wallets, 
  categories, 
  loading 
}: {
  onSubmit: (data: BudgetFormData) => void
  onCancel: () => void
  wallets: Wallet[]
  categories: Category[]
  loading: boolean
}) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>('monthly')
  const [categoryId, setCategoryId] = useState('')
  const [walletId, setWalletId] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState('')

  // Auto-select first wallet when wallets are loaded
  useEffect(() => {
    if (wallets.length > 0 && !walletId) {
      setWalletId(wallets[0].id)
    }
  }, [wallets, walletId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !amount || !walletId) return

    onSubmit({
      name: name.trim(),
      amount: parseFloat(amount),
      period,
      category_id: categoryId || null,
      wallet_id: walletId,
      start_date: new Date(startDate).toISOString(),
      end_date: endDate ? new Date(endDate).toISOString() : null
    })

    // Reset form
    resetForm()
  }

  const resetForm = () => {
    setName('')
    setAmount('')
    setPeriod('monthly')
    setCategoryId('')
    setStartDate(new Date().toISOString().split('T')[0])
    setEndDate('')
  }

  useEffect(() => {
    resetForm()
  }, [])

  // Filter expense categories only
  const expenseCategories = categories.filter(cat => cat.type === 'expense')

  return (
    <form onSubmit={handleSubmit} className="card-body space-y-4">
      <div>
        <label htmlFor="name" className="label">Budget Name *</label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          placeholder="e.g., Monthly Groceries"
          required
        />
      </div>

      <div>
        <label htmlFor="amount" className="label">Budget Amount *</label>
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
        <label htmlFor="period" className="label">Period *</label>
        <select
          id="period"
          value={period}
          onChange={(e) => setPeriod(e.target.value as 'weekly' | 'monthly' | 'yearly')}
          className="input"
          required
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>

      <div>
        <label htmlFor="wallet" className="label">Wallet *</label>
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
        <label htmlFor="category" className="label">Category (optional)</label>
        <select
          id="category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="input"
        >
          <option value="">All expenses</option>
          {expenseCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.icon} {category.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="startDate" className="label">Start Date *</label>
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
        <label htmlFor="endDate" className="label">End Date (optional)</label>
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
          onClick={onCancel}
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
  )
}

/**
 * Main modal component that orchestrates data fetching and form submission
 * Implements Single Responsibility Principle by separating modal logic from form logic
 */
export default function CreateBudgetModal({ isOpen, onClose, onBudgetCreated }: CreateBudgetModalProps) {
  // Use custom hooks for data fetching (implements DRY principle)
  const { data: walletsData, loading: walletsLoading, error: walletsError } = useWallets()
  const { data: categoriesData, loading: categoriesLoading, error: categoriesError } = useCategories()
  const { postData, loading: submitting, error: submitError } = useApiPost<BudgetFormData, any>('/api/budgets')

  const handleSubmit = async (formData: BudgetFormData) => {
    const result = await postData(formData)
    if (result) {
      onBudgetCreated()
      onClose()
    } else if (submitError) {
      alert(submitError)
    }
  }

  if (!isOpen) return null

  const wallets = walletsData?.wallets || []
  const categories = categoriesData?.categories || []
  const isLoading = walletsLoading || categoriesLoading

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Budget" maxWidth="lg">
      {isLoading ? (
        <ModalBody>
          <p className="text-center text-gray-600 dark:text-gray-400">Loading...</p>
        </ModalBody>
      ) : (
        <BudgetForm
          onSubmit={handleSubmit}
          onCancel={onClose}
          wallets={wallets}
          categories={categories}
          loading={submitting}
        />
      )}
    </Modal>
  )
}
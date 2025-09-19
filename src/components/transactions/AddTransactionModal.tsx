'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/types/database'
import { useWallets, useCategories, useApiPost } from '@/hooks/useApiData'
import { Modal, ModalBody } from '@/components/ui/Modal'

type Wallet = Database['public']['Tables']['wallets']['Row']
type Category = Database['public']['Tables']['categories']['Row']

interface AddTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onTransactionAdded: () => void
}

interface TransactionFormData {
  amount: number
  description: string
  type: 'income' | 'expense'
  category_id: string | null
  wallet_id: string
  date: string
}

/**
 * Form component responsible only for transaction form UI
 * Implements Single Responsibility Principle
 */
function TransactionForm({ 
  onSubmit, 
  onCancel,
  wallets, 
  categories, 
  loading 
}: {
  onSubmit: (data: TransactionFormData) => void
  onCancel: () => void
  wallets: Wallet[]
  categories: Category[]
  loading: boolean
}) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [categoryId, setCategoryId] = useState('')
  const [walletId, setWalletId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  // Auto-select first wallet when wallets are loaded
  useEffect(() => {
    if (wallets.length > 0 && !walletId) {
      setWalletId(wallets[0].id)
    }
  }, [wallets, walletId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !description || !walletId) return

    onSubmit({
      amount: parseFloat(amount),
      description: description.trim(),
      type,
      category_id: categoryId || null,
      wallet_id: walletId,
      date: new Date(date).toISOString()
    })

    // Reset form
    setAmount('')
    setDescription('')
    setType('expense')
    setCategoryId('')
    setDate(new Date().toISOString().split('T')[0])
  }

  const resetForm = () => {
    setAmount('')
    setDescription('')
    setType('expense')
    setCategoryId('')
    setDate(new Date().toISOString().split('T')[0])
  }

  useEffect(() => {
    resetForm()
  }, [])

  const filteredCategories = categories.filter(cat => cat.type === type)

  return (
    <form onSubmit={handleSubmit} className="card-body space-y-4">
      <div>
        <label className="label">Type *</label>
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
              className="mr-2 text-danger-600 focus:ring-danger-500"
            />
            <span className="text-danger-600 dark:text-danger-400">Expense</span>
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
              className="mr-2 text-success-600 focus:ring-success-500"
            />
            <span className="text-success-600 dark:text-success-400">Income</span>
          </label>
        </div>
      </div>

      <div>
        <label htmlFor="amount" className="label">Amount *</label>
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
        <label htmlFor="description" className="label">Description *</label>
        <input
          type="text"
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input"
          placeholder="Enter transaction description"
          required
        />
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
        <label htmlFor="category" className="label">Category</label>
        <select
          id="category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="input"
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
        <label htmlFor="date" className="label">Date *</label>
        <input
          type="date"
          id="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input"
          required
        />
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
          className="flex-1 btn-primary"
          disabled={loading || !amount || !description || !walletId}
        >
          {loading ? 'Adding...' : 'Add Transaction'}
        </button>
      </div>
    </form>
  )
}

/**
 * Main modal component that orchestrates data fetching and form submission
 * Implements Single Responsibility Principle by separating modal logic from form logic
 */
export default function AddTransactionModal({ isOpen, onClose, onTransactionAdded }: AddTransactionModalProps) {
  // Use custom hooks for data fetching (implements DRY principle)
  const { data: walletsData, loading: walletsLoading, error: walletsError } = useWallets()
  const { data: categoriesData, loading: categoriesLoading, error: categoriesError } = useCategories()
  const { postData, loading: submitting, error: submitError } = useApiPost<TransactionFormData, any>('/api/transactions')

  const handleSubmit = async (formData: TransactionFormData) => {
    const result = await postData(formData)
    if (result) {
      onTransactionAdded()
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
    <Modal isOpen={isOpen} onClose={onClose} title="Add Transaction">
      {isLoading ? (
        <ModalBody>
          <p className="text-center text-gray-600 dark:text-gray-400">Loading...</p>
        </ModalBody>
      ) : (
        <TransactionForm
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
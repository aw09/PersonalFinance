'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface CreateWalletModalProps {
  isOpen: boolean
  onClose: () => void
  onWalletCreated: () => void
}

export default function CreateWalletModal({ isOpen, onClose, onWalletCreated }: CreateWalletModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('No authentication token')
      }

      const response = await fetch('/api/wallets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          currency
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create wallet')
      }

      // Reset form
      setName('')
      setDescription('')
      setCurrency('USD')
      
      // Notify parent component
      onWalletCreated()
      onClose()
    } catch (error) {
      console.error('Error creating wallet:', error)
      alert(error instanceof Error ? error.message : 'Failed to create wallet')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay flex items-center justify-center z-50">
      <div className="modal-content w-full max-w-md mx-4">
        <div className="card-header">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Create New Wallet</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="card-body space-y-4">
          <div>
            <label htmlFor="name" className="label">
              Wallet Name *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g., Main Checking, Savings, Cash"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="label">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              placeholder="Optional description"
              rows={3}
            />
          </div>

          <div>
            <label htmlFor="currency" className="label">
              Currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="input"
            >
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
              <option value="JPY">JPY - Japanese Yen</option>
              <option value="IDR">IDR - Indonesian Rupiah</option>
              <option value="SGD">SGD - Singapore Dollar</option>
              <option value="MYR">MYR - Malaysian Ringgit</option>
            </select>
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
              className="flex-1 btn-primary"
              disabled={loading || !name.trim()}
            >
              {loading ? 'Creating...' : 'Create Wallet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
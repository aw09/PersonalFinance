'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CreateBudgetModal from './CreateBudgetModal'

interface Budget {
  id: string
  name: string
  amount: number
  period: 'weekly' | 'monthly' | 'yearly'
  start_date: string
  end_date: string | null
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

export default function BudgetList() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const fetchBudgets = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        setBudgets([])
        setLoading(false)
        return
      }

      const response = await fetch('/api/budgets', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch budgets')
      }

      const data = await response.json()
      setBudgets(data.budgets || [])
    } catch (error) {
      console.error('Error fetching budgets:', error)
      setBudgets([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBudgets()
  }, [])

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

  const getBudgetProgress = (budget: Budget) => {
    // This would need to be calculated based on actual spending
    // For now, return dummy progress
    return Math.random() * 100
  }

  const handleBudgetCreated = () => {
    fetchBudgets() // Refresh the list
  }

  if (loading) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <div className="card-body">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">My Budgets</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-success"
            >
              Create Budget
            </button>
          </div>

          {budgets.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 dark:text-gray-400 mb-4">
                <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              No budgets created yet
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Create your first budget to track your spending goals!
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-success"
            >
              Create Your First Budget
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {budgets.map((budget) => {
              const progress = getBudgetProgress(budget)
              const progressColor = progress > 90 ? 'bg-danger-500' : progress > 70 ? 'bg-warning-500' : 'bg-success-500'
              
              return (
                <div key={budget.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        {budget.categories?.icon && (
                          <span className="text-2xl">{budget.categories.icon}</span>
                        )}
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">{budget.name}</h3>
                          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                            {budget.categories && (
                              <span 
                                className="px-2 py-1 rounded text-white text-xs font-medium"
                                style={{ backgroundColor: budget.categories.color }}
                              >
                                {budget.categories.name}
                              </span>
                            )}
                            <span>{budget.wallets.name}</span>
                            <span>•</span>
                            <span className="capitalize">{budget.period}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(budget.amount, budget.wallets.currency)}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Budget</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Progress</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{progress.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${progressColor}`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
                    <div>
                      <span>Started: {formatDate(budget.start_date)}</span>
                      {budget.end_date && (
                        <span className="ml-4">Ends: {formatDate(budget.end_date)}</span>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium">
                        View Details
                      </button>
                      <button className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 font-medium">
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        </div>
      </div>

      <CreateBudgetModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onBudgetCreated={handleBudgetCreated}
      />
    </>
  )
}
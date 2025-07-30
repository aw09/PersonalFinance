'use client'

import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import WalletList from '@/components/wallets/WalletList'
import TransactionList from '@/components/transactions/TransactionList'
import AddTransactionModal from '@/components/transactions/AddTransactionModal'

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const router = useRouter()

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.user) {
        router.push('/')
        return
      }
      
      setUser(session.user)
      setLoading(false)
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          router.push('/')
        } else {
          setUser(session.user)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const handleTransactionAdded = () => {
    setRefreshKey(prev => prev + 1) // Force refresh of components
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect to home
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Personal Finance</h1>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Welcome, {user.email}</span>
              <button 
                onClick={handleSignOut}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Quick Stats Cards */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Total Balance</h2>
            <p className="text-3xl font-bold text-green-600">$0.00</p>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Monthly Expenses</h2>
            <p className="text-3xl font-bold text-red-600">$0.00</p>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Monthly Income</h2>
            <p className="text-3xl font-bold text-blue-600">$0.00</p>
          </div>
        </div>

        {/* Wallets Section */}
        <div className="mb-8">
          <WalletList key={`wallets-${refreshKey}`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Transactions */}
          <div>
            <TransactionList
              key={`transactions-${refreshKey}`}
              limit={5}
              onAddTransaction={() => setShowAddTransaction(true)}
            />
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button 
                onClick={() => setShowAddTransaction(true)}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition"
              >
                Add Transaction
              </button>
              <button className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition">
                Create Budget
              </button>
              <button className="w-full bg-yellow-600 text-white py-2 px-4 rounded-md hover:bg-yellow-700 transition">
                Track Investment
              </button>
              <button className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition">
                Manage Categories
              </button>
            </div>
          </div>
        </div>
      </div>

      <AddTransactionModal
        isOpen={showAddTransaction}
        onClose={() => setShowAddTransaction(false)}
        onTransactionAdded={handleTransactionAdded}
      />
    </main>
  )
}
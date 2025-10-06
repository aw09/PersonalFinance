'use client'

import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import WalletList from '@/components/wallets/WalletList'
import TransactionList from '@/components/transactions/TransactionList'
import AddTransactionModal from '@/components/transactions/AddTransactionModal'
import ReceiptUpload from '@/components/transactions/ReceiptUpload'
import BudgetList from '@/components/budgets/BudgetList'
import CreateBudgetModal from '@/components/budgets/CreateBudgetModal'
import TelegramLinkComponent from '@/components/telegram/TelegramLinkComponent'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { 
  Plus, 
  LogOut, 
  Smartphone, 
  TrendingUp, 
  Wallet, 
  PieChart,
  Menu,
  X,
  User as UserIcon
} from 'lucide-react'

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [showCreateBudget, setShowCreateBudget] = useState(false)
  const [showTelegramLink, setShowTelegramLink] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [activeNavItem, setActiveNavItem] = useState('home')
  const [refreshKey, setRefreshKey] = useState(0)
  const [firstWalletId, setFirstWalletId] = useState<string | null>(null)
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
      
      // Fetch first wallet for receipt upload
      if (session.access_token) {
        fetchFirstWallet(session.access_token)
      }
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          router.push('/')
        } else {
          setUser(session.user)
          setLoading(false)
          // Fetch first wallet for receipt upload
          if (session.access_token) {
            fetchFirstWallet(session.access_token)
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  const fetchFirstWallet = async (token: string) => {
    try {
      const response = await fetch('/api/wallets', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.wallets && data.wallets.length > 0) {
          setFirstWalletId(data.wallets[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch wallets:', error)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const handleDataUpdated = () => {
    setRefreshKey(prev => prev + 1)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner h-12 w-12 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile-First Header with Balance */}
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="px-4 sm:px-6">
          {/* Top row with balance and actions */}
          <div className="flex items-center justify-between py-4">
            <div className="flex-1">
              <div className="text-center lg:text-left">
                <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center lg:justify-start">
                  Total balance
                  <button className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </p>
                <p className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-gray-100">
                  $0.00
                </p>
              </div>
            </div>
            
            {/* Action icons */}
            <div className="flex items-center space-x-3">
              <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-12" />
                </svg>
              </button>
              <ThemeToggle />
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="lg:hidden p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {showMobileMenu && (
          <div className="lg:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <UserIcon className="h-4 w-4 mr-2" />
                {user.email}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setShowAddTransaction(true)
                    setShowMobileMenu(false)
                  }}
                  className="btn-primary text-sm py-2"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Transaction
                </button>
                <button
                  onClick={() => {
                    setShowCreateBudget(true)
                    setShowMobileMenu(false)
                  }}
                  className="btn-secondary text-sm py-2"
                >
                  <PieChart className="h-4 w-4 mr-2" />
                  Create Budget
                </button>
              </div>
              <button
                onClick={() => {
                  setShowTelegramLink(true)
                  setShowMobileMenu(false)
                }}
                className="w-full btn-secondary text-sm py-2 justify-start"
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Link Telegram
              </button>
              <button
                onClick={handleSignOut}
                className="w-full btn-danger text-sm py-2 justify-start"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="lg:flex">
        {/* Desktop Sidebar - hidden on mobile */}
        <aside className="hidden lg:block w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 min-h-screen">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gradient mb-8">Personal Finance</h1>
            
            <div className="space-y-6">
              {/* User Info */}
              <div className="pb-4 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/50 rounded-xl flex items-center justify-center">
                    <UserIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Welcome back!</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  Quick Actions
                </h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setShowAddTransaction(true)}
                    className="w-full btn-primary justify-start"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Transaction
                  </button>
                  <button
                    onClick={() => setShowCreateBudget(true)}
                    className="w-full btn-secondary justify-start"
                  >
                    <PieChart className="h-4 w-4 mr-2" />
                    Create Budget
                  </button>
                  <button
                    onClick={() => setShowTelegramLink(true)}
                    className="w-full btn-secondary justify-start"
                  >
                    <Smartphone className="h-4 w-4 mr-2" />
                    Link Telegram
                  </button>
                </div>
              </div>

              {/* Settings */}
              <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme</span>
                  <ThemeToggle />
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full btn-danger justify-start"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:ml-0">
          <div className="p-4 sm:p-6 space-y-4 pb-24 lg:pb-4">
            {/* My Wallets Section */}
            <section className="card">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">My Wallets</h2>
                  <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                    See all
                  </button>
                </div>
                <WalletList key={`wallets-${refreshKey}`} />
              </div>
            </section>

            {/* Reports Section */}
            <section className="card">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Report this month</h2>
                  <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                    See reports
                  </button>
                </div>
                
                {/* Total spent and income */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total spent</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">$0.00</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total income</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">$0.00</p>
                  </div>
                </div>

                {/* Interactive Chart Placeholder */}
                <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mb-4">
                  <div className="text-center">
                    <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Chart coming soon</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Track your spending trends</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Receipt Upload Section */}
            {firstWalletId && (
              <section className="card">
                <div className="p-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Upload Receipt</h2>
                  <ReceiptUpload 
                    walletId={firstWalletId} 
                    onTransactionCreated={handleDataUpdated}
                  />
                </div>
              </section>
            )}

            {/* Budgets Section */}
            <section className="card">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Budgets</h2>
                  <button 
                    onClick={() => setShowCreateBudget(true)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    Create budget
                  </button>
                </div>
                <BudgetList key={`budgets-${refreshKey}`} />
              </div>
            </section>

            {/* Recent Transactions Section */}
            <section className="card">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recent Transactions</h2>
                  <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                    See all
                  </button>
                </div>
                <TransactionList
                  key={`transactions-${refreshKey}`}
                  limit={5}
                  onAddTransaction={() => setShowAddTransaction(true)}
                />
              </div>
            </section>
          </div>
        </main>

        {/* Enhanced Bottom Navigation for Mobile */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 safe-area-pb">
          <div className="flex items-center justify-around px-2 py-1">
            <button 
              onClick={() => setActiveNavItem('home')}
              className={`flex flex-col items-center py-2 px-3 min-w-0 transition-colors ${
                activeNavItem === 'home' 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-9 9a1 1 0 001.414 1.414L2 12.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-4.586l.293.293a1 1 0 001.414-1.414l-9-9z" />
              </svg>
              <span className="text-xs font-medium">Home</span>
            </button>
            
            <button 
              onClick={() => setActiveNavItem('transactions')}
              className={`flex flex-col items-center py-2 px-3 min-w-0 transition-colors ${
                activeNavItem === 'transactions' 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="text-xs font-medium">Transactions</span>
            </button>

            {/* Central Add Button - Enhanced */}
            <button 
              onClick={() => setShowAddTransaction(true)}
              className="flex items-center justify-center w-14 h-14 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 -mt-2"
            >
              <Plus className="w-7 h-7" />
            </button>

            <button 
              onClick={() => setActiveNavItem('budgets')}
              className={`flex flex-col items-center py-2 px-3 min-w-0 transition-colors ${
                activeNavItem === 'budgets' 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <PieChart className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Budgets</span>
            </button>

            <button 
              onClick={() => setActiveNavItem('account')}
              className={`flex flex-col items-center py-2 px-3 min-w-0 transition-colors ${
                activeNavItem === 'account' 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <UserIcon className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Account</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Modals */}
      <AddTransactionModal
        isOpen={showAddTransaction}
        onClose={() => setShowAddTransaction(false)}
        onTransactionAdded={handleDataUpdated}
      />

      <CreateBudgetModal
        isOpen={showCreateBudget}
        onClose={() => setShowCreateBudget(false)}
        onBudgetCreated={handleDataUpdated}
      />

      {/* Telegram Link Modal */}
      {showTelegramLink && (
        <div className="modal-overlay flex items-center justify-center p-4 z-50">
          <div className="modal-content max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="card-header flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Telegram Integration</h2>
              <button
                onClick={() => setShowTelegramLink(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="card-body">
              <TelegramLinkComponent />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
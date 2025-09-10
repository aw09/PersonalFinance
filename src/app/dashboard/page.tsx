'use client'

import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import WalletList from '@/components/wallets/WalletList'
import TransactionList from '@/components/transactions/TransactionList'
import AddTransactionModal from '@/components/transactions/AddTransactionModal'
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
    <div className="min-h-screen">
      {/* Mobile Header */}
      <header className="nav lg:hidden">
        <div className="px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="btn-secondary p-2"
              >
                {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <h1 className="ml-3 text-xl font-bold text-gradient">Dashboard</h1>
            </div>
            <div className="flex items-center space-x-2">
              <ThemeToggle />
              <button
                onClick={() => setShowAddTransaction(true)}
                className="btn-primary p-2"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {showMobileMenu && (
          <div className="border-t border-gray-200 dark:border-gray-800">
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <UserIcon className="h-4 w-4 mr-2" />
                {user.email}
              </div>
              <button
                onClick={() => setShowCreateBudget(true)}
                className="w-full text-left py-2 text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                Create Budget
              </button>
              <button
                onClick={() => setShowTelegramLink(true)}
                className="w-full text-left py-2 text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                Link Telegram
              </button>
              <button
                onClick={handleSignOut}
                className="w-full text-left py-2 text-danger-600 hover:text-danger-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="lg:flex">
        {/* Desktop Sidebar */}
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
          <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8">
            {/* Welcome Section */}
            <div className="text-center lg:text-left">
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-gray-100">
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}! 👋
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Here&apos;s what&apos;s happening with your finances today
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              <div className="stat-card group">
                <div className="card-body">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="stat-label">Total Balance</p>
                      <p className="stat-value text-success-600 dark:text-success-400">$0.00</p>
                    </div>
                    <div className="w-12 h-12 bg-success-100 dark:bg-success-900/50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Wallet className="h-6 w-6 text-success-600 dark:text-success-400" />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="stat-card group">
                <div className="card-body">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="stat-label">Monthly Expenses</p>
                      <p className="stat-value text-danger-600 dark:text-danger-400">$0.00</p>
                    </div>
                    <div className="w-12 h-12 bg-danger-100 dark:bg-danger-900/50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <TrendingUp className="h-6 w-6 text-danger-600 dark:text-danger-400 rotate-180" />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="stat-card group sm:col-span-2 lg:col-span-1">
                <div className="card-body">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="stat-label">Monthly Income</p>
                      <p className="stat-value text-primary-600 dark:text-primary-400">$0.00</p>
                    </div>
                    <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <TrendingUp className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Wallets Section */}
            <WalletList key={`wallets-${refreshKey}`} />

            {/* Budgets Section */}
            <BudgetList key={`budgets-${refreshKey}`} />

            {/* Transactions Section */}
            <TransactionList
              key={`transactions-${refreshKey}`}
              limit={10}
              onAddTransaction={() => setShowAddTransaction(true)}
            />
          </div>
        </main>
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
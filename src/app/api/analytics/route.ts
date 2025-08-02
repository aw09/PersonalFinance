import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

export async function GET(request: NextRequest) {
  // Get the authorization header
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  
  // Create Supabase client with the user's session token
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  )

  // Verify the user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const walletId = url.searchParams.get('wallet_id')
    const period = url.searchParams.get('period') || '30' // days

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(period))

    // Base query conditions
    let baseConditions = `user_id.eq.${user.id}`
    if (walletId) {
      baseConditions += `,wallet_id.eq.${walletId}`
    }

    // Get summary statistics
    const [
      totalIncomeResult,
      totalExpenseResult,
      transactionCountResult,
      categoryBreakdownResult,
      monthlyTrendsResult,
      walletBalancesResult
    ] = await Promise.all([
      // Total income in period
      supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'income')
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString())
        .filter('user_id', 'eq', user.id)
        .then(res => res.data?.reduce((sum, t) => sum + t.amount, 0) || 0),

      // Total expenses in period
      supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'expense')
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString())
        .filter('user_id', 'eq', user.id)
        .then(res => res.data?.reduce((sum, t) => sum + t.amount, 0) || 0),

      // Transaction count
      supabase
        .from('transactions')
        .select('id', { count: 'exact' })
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString())
        .filter('user_id', 'eq', user.id),

      // Expense breakdown by category
      supabase
        .from('transactions')
        .select(`
          amount,
          category:categories(name, color, icon)
        `)
        .eq('type', 'expense')
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString())
        .filter('user_id', 'eq', user.id),

      // Monthly trends (last 6 months)
      supabase
        .from('transactions')
        .select('amount, type, date')
        .gte('date', new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString())
        .filter('user_id', 'eq', user.id)
        .order('date', { ascending: true }),

      // Wallet balances
      supabase
        .from('wallets')
        .select('name, balance, currency')
        .eq('owner_id', user.id)
    ])

    // Process category breakdown
    const categoryBreakdown = categoryBreakdownResult.data?.reduce((acc: any, transaction: any) => {
      const categoryName = transaction.category?.name || 'Uncategorized'
      const categoryColor = transaction.category?.color || '#6B7280'
      const categoryIcon = transaction.category?.icon || '📝'
      
      if (!acc[categoryName]) {
        acc[categoryName] = {
          name: categoryName,
          color: categoryColor,
          icon: categoryIcon,
          total: 0,
          count: 0
        }
      }
      
      acc[categoryName].total += transaction.amount
      acc[categoryName].count += 1
      return acc
    }, {}) || {}

    // Process monthly trends
    const monthlyTrends = monthlyTrendsResult.data?.reduce((acc: any, transaction: any) => {
      const month = new Date(transaction.date).toISOString().slice(0, 7) // YYYY-MM
      
      if (!acc[month]) {
        acc[month] = { income: 0, expense: 0, net: 0 }
      }
      
      if (transaction.type === 'income') {
        acc[month].income += transaction.amount
      } else if (transaction.type === 'expense') {
        acc[month].expense += transaction.amount
      }
      
      acc[month].net = acc[month].income - acc[month].expense
      return acc
    }, {}) || {}

    // Calculate net worth (total wallet balances)
    const netWorth = walletBalancesResult.data?.reduce((sum, wallet) => sum + wallet.balance, 0) || 0

    // Calculate savings rate
    const totalIncome = await totalIncomeResult
    const totalExpense = await totalExpenseResult
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0

    const analytics = {
      summary: {
        totalIncome: totalIncome,
        totalExpense: totalExpense,
        netIncome: totalIncome - totalExpense,
        transactionCount: transactionCountResult.count || 0,
        savingsRate: Math.round(savingsRate * 100) / 100,
        netWorth: netWorth,
        period: parseInt(period)
      },
      categoryBreakdown: Object.values(categoryBreakdown),
      monthlyTrends: Object.entries(monthlyTrends).map(([month, data]: [string, any]) => ({
        month,
        ...data
      })),
      walletBalances: walletBalancesResult.data || [],
      topExpenseCategories: Object.values(categoryBreakdown)
        .sort((a: any, b: any) => b.total - a.total)
        .slice(0, 5),
      recentTransactionStats: {
        avgDailyExpense: totalExpense / parseInt(period),
        avgDailyIncome: totalIncome / parseInt(period),
        avgTransactionAmount: (transactionCountResult.count || 0) > 0 
          ? (totalIncome + totalExpense) / (transactionCountResult.count || 1)
          : 0
      }
    }

    return NextResponse.json({ analytics })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
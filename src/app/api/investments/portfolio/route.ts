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
    // Get all investments for the user
    const { data: investments, error } = await supabase
      .from('investments')
      .select(`
        *,
        wallet:wallets(name, currency)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching investments:', error)
      return NextResponse.json({ error: 'Failed to fetch investments' }, { status: 500 })
    }

    // Calculate portfolio metrics
    const totalInitialValue = investments.reduce((sum, inv) => sum + inv.initial_amount, 0)
    const totalCurrentValue = investments.reduce((sum, inv) => sum + inv.current_value, 0)
    const totalGainLoss = totalCurrentValue - totalInitialValue
    const totalReturn = totalInitialValue > 0 ? (totalGainLoss / totalInitialValue) * 100 : 0

    // Group by investment type
    const typeBreakdown = investments.reduce((acc: any, inv) => {
      if (!acc[inv.type]) {
        acc[inv.type] = {
          type: inv.type,
          count: 0,
          initialValue: 0,
          currentValue: 0,
          gainLoss: 0,
          return: 0
        }
      }
      
      acc[inv.type].count += 1
      acc[inv.type].initialValue += inv.initial_amount
      acc[inv.type].currentValue += inv.current_value
      acc[inv.type].gainLoss = acc[inv.type].currentValue - acc[inv.type].initialValue
      acc[inv.type].return = acc[inv.type].initialValue > 0 
        ? (acc[inv.type].gainLoss / acc[inv.type].initialValue) * 100 
        : 0
      
      return acc
    }, {})

    // Group by wallet/currency
    const walletBreakdown = investments.reduce((acc: any, inv) => {
      const walletKey = `${inv.wallet.name} (${inv.wallet.currency})`
      
      if (!acc[walletKey]) {
        acc[walletKey] = {
          wallet: inv.wallet.name,
          currency: inv.wallet.currency,
          count: 0,
          initialValue: 0,
          currentValue: 0,
          gainLoss: 0,
          return: 0
        }
      }
      
      acc[walletKey].count += 1
      acc[walletKey].initialValue += inv.initial_amount
      acc[walletKey].currentValue += inv.current_value
      acc[walletKey].gainLoss = acc[walletKey].currentValue - acc[walletKey].initialValue
      acc[walletKey].return = acc[walletKey].initialValue > 0 
        ? (acc[walletKey].gainLoss / acc[walletKey].initialValue) * 100 
        : 0
      
      return acc
    }, {})

    // Top performers and losers
    const investmentPerformance = investments.map(inv => ({
      ...inv,
      gainLoss: inv.current_value - inv.initial_amount,
      return: inv.initial_amount > 0 ? ((inv.current_value - inv.initial_amount) / inv.initial_amount) * 100 : 0
    }))

    const topPerformers = investmentPerformance
      .sort((a, b) => b.return - a.return)
      .slice(0, 5)

    const worstPerformers = investmentPerformance
      .sort((a, b) => a.return - b.return)
      .slice(0, 5)

    // Recent investments (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const recentInvestments = investments.filter(inv => 
      new Date(inv.purchase_date) >= thirtyDaysAgo
    )

    // Calculate allocation percentages
    const allocationByType = Object.values(typeBreakdown).map((type: any) => ({
      ...type,
      percentage: totalCurrentValue > 0 ? (type.currentValue / totalCurrentValue) * 100 : 0
    }))

    const portfolio = {
      summary: {
        totalInvestments: investments.length,
        totalInitialValue,
        totalCurrentValue,
        totalGainLoss,
        totalReturn: Math.round(totalReturn * 100) / 100,
        averageReturn: investments.length > 0 
          ? investmentPerformance.reduce((sum, inv) => sum + inv.return, 0) / investments.length 
          : 0
      },
      breakdown: {
        byType: allocationByType,
        byWallet: Object.values(walletBreakdown)
      },
      performance: {
        topPerformers,
        worstPerformers,
        bestPerformingType: allocationByType.length > 0 
          ? allocationByType.reduce((best: any, current: any) => 
              current.return > best.return ? current : best
            )
          : null,
        worstPerformingType: allocationByType.length > 0 
          ? allocationByType.reduce((worst: any, current: any) => 
              current.return < worst.return ? current : worst
            )
          : null
      },
      recent: {
        recentInvestments: recentInvestments.length,
        recentValue: recentInvestments.reduce((sum, inv) => sum + inv.initial_amount, 0),
        investments: recentInvestments.slice(0, 10) // Latest 10
      },
      diversification: {
        typeCount: Object.keys(typeBreakdown).length,
        walletCount: Object.keys(walletBreakdown).length,
        averageInvestmentSize: investments.length > 0 ? totalCurrentValue / investments.length : 0,
        largestInvestment: investments.length > 0 
          ? Math.max(...investments.map(inv => inv.current_value))
          : 0,
        smallestInvestment: investments.length > 0 
          ? Math.min(...investments.map(inv => inv.current_value))
          : 0
      }
    }

    return NextResponse.json({ portfolio })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
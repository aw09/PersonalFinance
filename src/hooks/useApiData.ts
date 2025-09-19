import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface UseApiDataOptions {
  refetchKey?: number
  autoFetch?: boolean
}

/**
 * Custom hook for API data fetching
 * Implements Single Responsibility Principle by separating data fetching from UI logic
 * Implements DRY principle by providing reusable data fetching logic
 */
export function useApiData<T>(
  endpoint: string,
  options: UseApiDataOptions = { autoFetch: true }
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }

      const response = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    if (options.autoFetch) {
      fetchData()
    }
  }, [fetchData, options.refetchKey, options.autoFetch])

  return { data, loading, error, refetch: fetchData }
}

/**
 * Hook for posting data to API endpoints
 * Implements Single Responsibility Principle by handling POST operations separately
 */
export function useApiPost<TRequest, TResponse>(endpoint: string) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const postData = useCallback(async (data: TRequest): Promise<TResponse | null> => {
    setLoading(true)
    setError(null)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      return null
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  return { postData, loading, error }
}

/**
 * Specific hooks for common data types
 * Implements DRY principle by providing typed, domain-specific hooks
 */
export function useWallets(refetchKey?: number) {
  return useApiData<{ wallets: any[] }>('/api/wallets', { refetchKey })
}

export function useCategories(refetchKey?: number) {
  return useApiData<{ categories: any[] }>('/api/categories', { refetchKey })
}

export function useTransactions(refetchKey?: number) {
  return useApiData<{ transactions: any[] }>('/api/transactions', { refetchKey })
}

export function useBudgets(refetchKey?: number) {
  return useApiData<{ budgets: any[] }>('/api/budgets', { refetchKey })
}
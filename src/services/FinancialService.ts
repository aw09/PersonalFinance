/**
 * Financial Service - Business Logic Layer
 * Implements Single Responsibility Principle by handling financial calculations and validations
 * Implements Dependency Inversion Principle by depending on abstractions rather than concrete implementations
 */

export interface TransactionData {
  amount: number
  type: 'income' | 'expense'
  date: string
}

export interface BudgetData {
  amount: number
  period: 'weekly' | 'monthly' | 'yearly'
  start_date: string
  end_date?: string
}

export interface WalletBalance {
  current_balance: number
  currency: string
}

/**
 * Core financial calculations and business rules
 * Implements KISS principle with focused, simple methods
 */
export class FinancialService {
  
  /**
   * Calculate wallet balance from transactions
   * Pure function that follows functional programming principles
   */
  static calculateBalance(transactions: TransactionData[], initialBalance: number = 0): number {
    return transactions.reduce((balance, transaction) => {
      return transaction.type === 'income' 
        ? balance + transaction.amount
        : balance - transaction.amount
    }, initialBalance)
  }

  /**
   * Calculate budget progress percentage
   * Returns value between 0-100, with values over 100 indicating budget exceeded
   */
  static calculateBudgetProgress(spent: number, budgetAmount: number): number {
    if (budgetAmount <= 0) return 0
    return Math.round((spent / budgetAmount) * 100)
  }

  /**
   * Determine if budget is within healthy limits
   * Business rule: Warn at 80%, alert at 100%
   */
  static getBudgetStatus(progressPercentage: number): 'healthy' | 'warning' | 'exceeded' {
    if (progressPercentage >= 100) return 'exceeded'
    if (progressPercentage >= 80) return 'warning'
    return 'healthy'
  }

  /**
   * Calculate monthly equivalent amount for different budget periods
   * Implements business logic for period normalization
   */
  static normalizeToMonthly(amount: number, period: BudgetData['period']): number {
    switch (period) {
      case 'weekly':
        return amount * 4.33 // Average weeks per month
      case 'yearly':
        return amount / 12
      case 'monthly':
      default:
        return amount
    }
  }

  /**
   * Validate transaction amount
   * Business rule: Amounts must be positive and reasonable
   */
  static validateTransactionAmount(amount: number): { isValid: boolean; error?: string } {
    if (amount <= 0) {
      return { isValid: false, error: 'Amount must be greater than zero' }
    }
    
    if (amount > 1000000) {
      return { isValid: false, error: 'Amount cannot exceed $1,000,000' }
    }

    if (Number.isNaN(amount) || !Number.isFinite(amount)) {
      return { isValid: false, error: 'Amount must be a valid number' }
    }

    return { isValid: true }
  }

  /**
   * Validate budget data
   * Consolidates all budget validation logic
   */
  static validateBudgetData(budget: Partial<BudgetData>): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!budget.amount || budget.amount <= 0) {
      errors.push('Budget amount must be greater than zero')
    }

    if (budget.amount && budget.amount > 1000000) {
      errors.push('Budget amount cannot exceed $1,000,000')
    }

    if (!budget.period || !['weekly', 'monthly', 'yearly'].includes(budget.period)) {
      errors.push('Budget period must be weekly, monthly, or yearly')
    }

    if (!budget.start_date) {
      errors.push('Start date is required')
    }

    if (budget.start_date && budget.end_date) {
      const startDate = new Date(budget.start_date)
      const endDate = new Date(budget.end_date)
      
      if (endDate <= startDate) {
        errors.push('End date must be after start date')
      }
    }

    return { isValid: errors.length === 0, errors }
  }

  /**
   * Format currency amount for display
   * Implements consistent formatting across the application
   */
  static formatCurrency(amount: number, currency: string = 'USD'): string {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount)
    } catch (error) {
      // Fallback for unsupported currencies
      return `${currency} ${amount.toFixed(2)}`
    }
  }

  /**
   * Calculate date ranges for budget periods
   * Implements business logic for period calculations
   */
  static calculatePeriodRange(startDate: string, period: BudgetData['period']): { start: Date; end: Date } {
    const start = new Date(startDate)
    const end = new Date(start)

    switch (period) {
      case 'weekly':
        end.setDate(start.getDate() + 7)
        break
      case 'monthly':
        end.setMonth(start.getMonth() + 1)
        break
      case 'yearly':
        end.setFullYear(start.getFullYear() + 1)
        break
    }

    return { start, end }
  }

  /**
   * Check if a date falls within a budget period
   * Useful for filtering transactions by budget period
   */
  static isDateInBudgetPeriod(transactionDate: string, budget: BudgetData): boolean {
    const txDate = new Date(transactionDate)
    const budgetStart = new Date(budget.start_date)
    let budgetEnd: Date

    if (budget.end_date) {
      budgetEnd = new Date(budget.end_date)
    } else {
      const periodRange = this.calculatePeriodRange(budget.start_date, budget.period)
      budgetEnd = periodRange.end
    }

    return txDate >= budgetStart && txDate <= budgetEnd
  }
}
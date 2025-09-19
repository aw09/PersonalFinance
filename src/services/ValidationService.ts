/**
 * Validation Service - Input Validation Layer
 * Implements Single Responsibility Principle by focusing solely on validation logic
 * Implements DRY principle by centralizing validation rules
 */

export interface ValidationRule<T> {
  validate: (value: T) => boolean
  message: string
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

/**
 * Centralized validation service
 * Implements Open/Closed Principle by being extensible through configuration
 */
export class ValidationService {
  
  /**
   * Validate a single value against multiple rules
   */
  static validateField<T>(value: T, rules: ValidationRule<T>[]): ValidationResult {
    const errors: string[] = []
    
    for (const rule of rules) {
      if (!rule.validate(value)) {
        errors.push(rule.message)
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Validate an object against a schema of rules
   */
  static validateObject<T extends Record<string, any>>(
    obj: T, 
    schema: Partial<Record<keyof T, ValidationRule<T[keyof T]>[]>>
  ): ValidationResult {
    const allErrors: string[] = []

    for (const [key, rules] of Object.entries(schema)) {
      if (rules && obj[key] !== undefined) {
        const result = this.validateField(obj[key], rules as ValidationRule<any>[])
        allErrors.push(...result.errors)
      }
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors
    }
  }

  /**
   * Common validation rules - implements DRY principle
   */
  static rules = {
    required: <T>(fieldName: string): ValidationRule<T> => ({
      validate: (value: T) => value !== null && value !== undefined && value !== '',
      message: `${fieldName} is required`
    }),

    minLength: (min: number, fieldName: string): ValidationRule<string> => ({
      validate: (value: string) => Boolean(value && value.length >= min),
      message: `${fieldName} must be at least ${min} characters long`
    }),

    maxLength: (max: number, fieldName: string): ValidationRule<string> => ({
      validate: (value: string) => !value || value.length <= max,
      message: `${fieldName} cannot exceed ${max} characters`
    }),

    email: (): ValidationRule<string> => ({
      validate: (value: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return !value || emailRegex.test(value)
      },
      message: 'Please enter a valid email address'
    }),

    positiveNumber: (fieldName: string): ValidationRule<number> => ({
      validate: (value: number) => value > 0,
      message: `${fieldName} must be greater than zero`
    }),

    nonNegativeNumber: (fieldName: string): ValidationRule<number> => ({
      validate: (value: number) => value >= 0,
      message: `${fieldName} cannot be negative`
    }),

    maxValue: (max: number, fieldName: string): ValidationRule<number> => ({
      validate: (value: number) => value <= max,
      message: `${fieldName} cannot exceed ${max}`
    }),

    currency: (fieldName: string): ValidationRule<string> => ({
      validate: (value: string) => {
        // Validate ISO 4217 currency codes (simplified)
        const currencyRegex = /^[A-Z]{3}$/
        return !value || currencyRegex.test(value)
      },
      message: `${fieldName} must be a valid 3-letter currency code`
    }),

    dateAfter: (afterDate: string, fieldName: string): ValidationRule<string> => ({
      validate: (value: string) => {
        if (!value) return true
        return new Date(value) > new Date(afterDate)
      },
      message: `${fieldName} must be after ${afterDate}`
    }),

    oneOf: <T>(allowedValues: T[], fieldName: string): ValidationRule<T> => ({
      validate: (value: T) => allowedValues.includes(value),
      message: `${fieldName} must be one of: ${allowedValues.join(', ')}`
    })
  }

  /**
   * Pre-configured validation schemas for common entities
   * Implements YAGNI by only including validations actually used
   */
  static schemas = {
    wallet: {
      name: [
        ValidationService.rules.required('Wallet name'),
        ValidationService.rules.minLength(1, 'Wallet name'),
        ValidationService.rules.maxLength(50, 'Wallet name')
      ],
      currency: [
        ValidationService.rules.required('Currency'),
        ValidationService.rules.currency('Currency')
      ]
    },

    transaction: {
      amount: [
        ValidationService.rules.required('Amount'),
        ValidationService.rules.positiveNumber('Amount'),
        ValidationService.rules.maxValue(1000000, 'Amount')
      ],
      description: [
        ValidationService.rules.required('Description'),
        ValidationService.rules.minLength(1, 'Description'),
        ValidationService.rules.maxLength(200, 'Description')
      ],
      type: [
        ValidationService.rules.required('Transaction type'),
        ValidationService.rules.oneOf(['income', 'expense'], 'Transaction type')
      ]
    },

    budget: {
      name: [
        ValidationService.rules.required('Budget name'),
        ValidationService.rules.minLength(1, 'Budget name'),
        ValidationService.rules.maxLength(100, 'Budget name')
      ],
      amount: [
        ValidationService.rules.required('Budget amount'),
        ValidationService.rules.positiveNumber('Budget amount'),
        ValidationService.rules.maxValue(1000000, 'Budget amount')
      ],
      period: [
        ValidationService.rules.required('Budget period'),
        ValidationService.rules.oneOf(['weekly', 'monthly', 'yearly'], 'Budget period')
      ]
    }
  }

  /**
   * Quick validation methods for common use cases
   * Implements KISS principle with simple, focused methods
   */
  static validateWallet(wallet: { name?: string; currency?: string }) {
    const errors: string[] = []
    
    if (!wallet.name) {
      errors.push('Wallet name is required')
    } else if (wallet.name.length > 50) {
      errors.push('Wallet name cannot exceed 50 characters')
    }
    
    if (!wallet.currency) {
      errors.push('Currency is required')
    } else if (!/^[A-Z]{3}$/.test(wallet.currency)) {
      errors.push('Currency must be a valid 3-letter currency code')
    }
    
    return { isValid: errors.length === 0, errors }
  }

  static validateTransaction(transaction: { amount?: number; description?: string; type?: string }) {
    const errors: string[] = []
    
    if (!transaction.amount) {
      errors.push('Amount is required')
    } else if (transaction.amount <= 0) {
      errors.push('Amount must be greater than zero')
    } else if (transaction.amount > 1000000) {
      errors.push('Amount cannot exceed 1,000,000')
    }
    
    if (!transaction.description) {
      errors.push('Description is required')
    } else if (transaction.description.length > 200) {
      errors.push('Description cannot exceed 200 characters')
    }
    
    if (!transaction.type) {
      errors.push('Transaction type is required')
    } else if (!['income', 'expense'].includes(transaction.type)) {
      errors.push('Transaction type must be income or expense')
    }
    
    return { isValid: errors.length === 0, errors }
  }

  static validateBudget(budget: { name?: string; amount?: number; period?: string }) {
    const errors: string[] = []
    
    if (!budget.name) {
      errors.push('Budget name is required')
    } else if (budget.name.length > 100) {
      errors.push('Budget name cannot exceed 100 characters')
    }
    
    if (!budget.amount) {
      errors.push('Budget amount is required')
    } else if (budget.amount <= 0) {
      errors.push('Budget amount must be greater than zero')
    } else if (budget.amount > 1000000) {
      errors.push('Budget amount cannot exceed 1,000,000')
    }
    
    if (!budget.period) {
      errors.push('Budget period is required')
    } else if (!['weekly', 'monthly', 'yearly'].includes(budget.period)) {
      errors.push('Budget period must be weekly, monthly, or yearly')
    }
    
    return { isValid: errors.length === 0, errors }
  }
}
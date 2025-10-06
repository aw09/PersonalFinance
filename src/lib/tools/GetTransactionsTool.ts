// Get Transactions Tool
// Handles retrieval of transaction history with filtering

import { BaseTool, ToolResult, ToolParameters } from './BaseTool'

export class GetTransactionsTool extends BaseTool {
  readonly name = 'get_transactions'
  readonly description = 'Retrieve recent transactions with optional filtering'
  
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of transactions to return (default: 10)'
      },
      wallet_name: {
        type: 'string',
        description: 'Filter by specific wallet name (optional)'
      },
      type: {
        type: 'string',
        description: 'Filter by transaction type (optional)',
        enum: ['income', 'expense']
      }
    }
  }

  async execute(args: Record<string, any>, context?: any): Promise<ToolResult> {
    // Set default limit
    const limit = args.limit || 10

    // Validate limit
    if (typeof limit !== 'number' || limit <= 0 || limit > 100) {
      return this.error('Limit must be a positive number between 1 and 100')
    }

    // Validate type if provided
    if (args.type && !['income', 'expense'].includes(args.type)) {
      return this.error('Transaction type must be either "income" or "expense"')
    }

    try {
      // This would normally call the actual transaction retrieval service
      // For now, we'll simulate the operation with mock data
      const mockTransactions = [
        {
          id: 'tx_001',
          amount: 50.00,
          description: 'Groceries',
          type: 'expense',
          category: 'food',
          wallet_name: 'main',
          created_at: '2024-01-10T10:00:00Z'
        },
        {
          id: 'tx_002',
          amount: 2500.00,
          description: 'Salary',
          type: 'income',
          category: 'salary',
          wallet_name: 'main',
          created_at: '2024-01-01T09:00:00Z'
        },
        {
          id: 'tx_003',
          amount: 25.00,
          description: 'Coffee',
          type: 'expense',
          category: 'food',
          wallet_name: 'daily',
          created_at: '2024-01-09T08:30:00Z'
        }
      ]

      // Apply filters
      let filteredTransactions = mockTransactions

      if (args.wallet_name) {
        filteredTransactions = filteredTransactions.filter(tx => 
          tx.wallet_name.toLowerCase() === args.wallet_name.toLowerCase()
        )
      }

      if (args.type) {
        filteredTransactions = filteredTransactions.filter(tx => tx.type === args.type)
      }

      // Apply limit
      filteredTransactions = filteredTransactions.slice(0, limit)

      const filterDescription = []
      if (args.wallet_name) filterDescription.push(`wallet: ${args.wallet_name}`)
      if (args.type) filterDescription.push(`type: ${args.type}`)
      
      const message = `Retrieved ${filteredTransactions.length} transaction${filteredTransactions.length !== 1 ? 's' : ''}`
        + (filterDescription.length > 0 ? ` (filtered by ${filterDescription.join(', ')})` : '')

      return this.success(
        { 
          transactions: filteredTransactions,
          total: filteredTransactions.length,
          limit: limit
        },
        message
      )
    } catch (error) {
      return this.error(`Failed to retrieve transactions: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
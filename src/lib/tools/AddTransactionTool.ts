// Add Transaction Tool
// Handles creation of new financial transactions

import { BaseTool, ToolResult, ToolParameters } from './BaseTool'

export class AddTransactionTool extends BaseTool {
  readonly name = 'add_transaction'
  readonly description = 'Add a new financial transaction (income or expense) to a wallet'
  
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      amount: {
        type: 'number',
        description: 'Transaction amount in the wallet currency'
      },
      description: {
        type: 'string',
        description: 'Description of the transaction'
      },
      type: {
        type: 'string',
        description: 'Transaction type',
        enum: ['income', 'expense']
      },
      category: {
        type: 'string',
        description: 'Transaction category (e.g., food, transport, salary)'
      },
      wallet_name: {
        type: 'string',
        description: 'Name of the wallet to add transaction to'
      }
    },
    required: ['amount', 'description', 'type', 'wallet_name']
  }

  async execute(args: Record<string, any>, context?: any): Promise<ToolResult> {
    // Validate required parameters
    const validationError = this.validateRequired(args, ['amount', 'description', 'type', 'wallet_name'])
    if (validationError) {
      return this.error(validationError)
    }

    // Validate transaction type
    if (!['income', 'expense'].includes(args.type)) {
      return this.error('Transaction type must be either "income" or "expense"')
    }

    // Validate amount
    if (typeof args.amount !== 'number' || args.amount <= 0) {
      return this.error('Amount must be a positive number')
    }

    try {
      // This would normally call the actual transaction creation service
      // For now, we'll simulate the operation
      const transaction = {
        id: `tx_${Date.now()}`,
        amount: args.amount,
        description: args.description,
        type: args.type,
        category: args.category || 'uncategorized',
        wallet_name: args.wallet_name,
        created_at: new Date().toISOString()
      }

      return this.success(
        transaction,
        `Successfully added ${args.type} transaction of ${args.amount} for "${args.description}" to ${args.wallet_name} wallet`
      )
    } catch (error) {
      return this.error(`Failed to add transaction: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
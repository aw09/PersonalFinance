// Update Wallet Tool
// Handles updating existing wallet properties

import { BaseTool, ToolResult, ToolParameters } from './BaseTool'

export class UpdateWalletTool extends BaseTool {
  readonly name = 'update_wallet'
  readonly description = 'Update an existing wallet properties like currency or name'
  
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      current_name: {
        type: 'string',
        description: 'Current name of the wallet to update'
      },
      new_name: {
        type: 'string',
        description: 'New name for the wallet (optional)'
      },
      new_currency: {
        type: 'string',
        description: 'New currency code for the wallet (optional)'
      }
    },
    required: ['current_name']
  }

  async execute(args: Record<string, any>, context?: any): Promise<ToolResult> {
    // Validate required parameters
    const validationError = this.validateRequired(args, ['current_name'])
    if (validationError) {
      return this.error(validationError)
    }

    // Check if at least one update field is provided
    if (!args.new_name && !args.new_currency) {
      return this.error('At least one update field (new_name or new_currency) must be provided')
    }

    // Validate new currency format if provided
    if (args.new_currency) {
      const currency = args.new_currency.toUpperCase()
      if (!/^[A-Z]{3}$/.test(currency)) {
        return this.error('New currency must be a 3-letter code (e.g., USD, EUR, IDR)')
      }
      args.new_currency = currency
    }

    try {
      // This would normally call the actual wallet update service
      // For now, we'll simulate the operation
      const updates: any = {}
      if (args.new_name) updates.name = args.new_name
      if (args.new_currency) updates.currency = args.new_currency

      const updatedWallet = {
        id: `wallet_${Date.now()}`,
        current_name: args.current_name,
        ...updates,
        updated_at: new Date().toISOString()
      }

      const changeDescription = Object.entries(updates)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')

      return this.success(
        updatedWallet,
        `Successfully updated wallet "${args.current_name}". Changes: ${changeDescription}`
      )
    } catch (error) {
      return this.error(`Failed to update wallet: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
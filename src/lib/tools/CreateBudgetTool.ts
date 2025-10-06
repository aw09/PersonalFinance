// Create Budget Tool
// Handles creation of new budgets for expense tracking

import { BaseTool, ToolResult, ToolParameters } from './BaseTool'

export class CreateBudgetTool extends BaseTool {
  readonly name = 'create_budget'
  readonly description = 'Create a new budget for expense tracking and limits'
  
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the budget (e.g., "Monthly Groceries", "Entertainment")'
      },
      amount: {
        type: 'number',
        description: 'Budget limit amount'
      },
      category: {
        type: 'string',
        description: 'Category this budget applies to (optional)'
      },
      period: {
        type: 'string',
        description: 'Budget period',
        enum: ['monthly', 'weekly', 'yearly']
      }
    },
    required: ['name', 'amount', 'period']
  }

  async execute(args: Record<string, any>, context?: any): Promise<ToolResult> {
    // Validate required parameters
    const validationError = this.validateRequired(args, ['name', 'amount', 'period'])
    if (validationError) {
      return this.error(validationError)
    }

    // Validate amount
    if (typeof args.amount !== 'number' || args.amount <= 0) {
      return this.error('Budget amount must be a positive number')
    }

    // Validate period
    if (!['monthly', 'weekly', 'yearly'].includes(args.period)) {
      return this.error('Budget period must be either "monthly", "weekly", or "yearly"')
    }

    try {
      // This would normally call the actual budget creation service
      // For now, we'll simulate the operation
      const budget = {
        id: `budget_${Date.now()}`,
        name: args.name,
        amount: args.amount,
        category: args.category || 'general',
        period: args.period,
        spent: 0, // No spending yet on new budget
        remaining: args.amount,
        created_at: new Date().toISOString(),
        period_start: this.getPeriodStart(args.period),
        period_end: this.getPeriodEnd(args.period)
      }

      return this.success(
        budget,
        `Successfully created ${args.period} budget "${args.name}" with limit of ${args.amount}${args.category ? ` for category "${args.category}"` : ''}`
      )
    } catch (error) {
      return this.error(`Failed to create budget: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private getPeriodStart(period: string): string {
    const now = new Date()
    switch (period) {
      case 'weekly':
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - now.getDay()) // Start of week (Sunday)
        return weekStart.toISOString()
      case 'monthly':
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      case 'yearly':
        return new Date(now.getFullYear(), 0, 1).toISOString()
      default:
        return now.toISOString()
    }
  }

  private getPeriodEnd(period: string): string {
    const now = new Date()
    switch (period) {
      case 'weekly':
        const weekEnd = new Date(now)
        weekEnd.setDate(now.getDate() - now.getDay() + 6) // End of week (Saturday)
        return weekEnd.toISOString()
      case 'monthly':
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()
      case 'yearly':
        return new Date(now.getFullYear(), 11, 31).toISOString()
      default:
        return now.toISOString()
    }
  }
}
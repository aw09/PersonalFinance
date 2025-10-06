// Get Categories Tool
// Handles retrieval of all transaction categories

import { BaseTool, ToolResult, ToolParameters } from './BaseTool'

export class GetCategoriesTool extends BaseTool {
  readonly name = 'get_categories'
  readonly description = 'Retrieve all available transaction categories'
  
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Filter by category type (optional)',
        enum: ['income', 'expense']
      }
    }
  }

  async execute(args: Record<string, any>, context?: any): Promise<ToolResult> {
    // Validate type if provided
    if (args.type && !['income', 'expense'].includes(args.type)) {
      return this.error('Category type must be either "income" or "expense"')
    }

    try {
      // This would normally call the actual category retrieval service
      // For now, we'll simulate the operation with mock data
      const mockCategories = [
        {
          id: 'cat_001',
          name: 'Salary',
          type: 'income',
          description: 'Monthly salary income',
          created_at: '2024-01-01T00:00:00Z',
          transaction_count: 12,
          is_active: true
        },
        {
          id: 'cat_002',
          name: 'Freelance',
          type: 'income',
          description: 'Freelance project income',
          created_at: '2024-01-01T00:00:00Z',
          transaction_count: 5,
          is_active: true
        },
        {
          id: 'cat_003',
          name: 'Groceries',
          type: 'expense',
          description: 'Food and household items',
          created_at: '2024-01-01T00:00:00Z',
          transaction_count: 45,
          is_active: true
        },
        {
          id: 'cat_004',
          name: 'Transportation',
          type: 'expense',
          description: 'Public transport, gas, parking',
          created_at: '2024-01-01T00:00:00Z',
          transaction_count: 28,
          is_active: true
        },
        {
          id: 'cat_005',
          name: 'Entertainment',
          type: 'expense',
          description: 'Movies, dining out, hobbies',
          created_at: '2024-01-01T00:00:00Z',
          transaction_count: 15,
          is_active: true
        },
        {
          id: 'cat_006',
          name: 'Utilities',
          type: 'expense',
          description: 'Electricity, water, internet',
          created_at: '2024-01-01T00:00:00Z',
          transaction_count: 8,
          is_active: true
        }
      ]

      // Apply filter if specified
      let filteredCategories = mockCategories
      if (args.type) {
        filteredCategories = mockCategories.filter(cat => cat.type === args.type)
      }

      // Separate by type for better organization
      const incomeCategories = filteredCategories.filter(cat => cat.type === 'income')
      const expenseCategories = filteredCategories.filter(cat => cat.type === 'expense')

      const message = `Retrieved ${filteredCategories.length} categor${filteredCategories.length !== 1 ? 'ies' : 'y'}`
        + (args.type ? ` of type "${args.type}"` : ` (${incomeCategories.length} income, ${expenseCategories.length} expense)`)

      return this.success(
        {
          categories: filteredCategories,
          by_type: {
            income: incomeCategories,
            expense: expenseCategories
          },
          summary: {
            total: filteredCategories.length,
            income_count: incomeCategories.length,
            expense_count: expenseCategories.length,
            most_used: filteredCategories.sort((a, b) => b.transaction_count - a.transaction_count)[0]?.name || 'None'
          }
        },
        message
      )
    } catch (error) {
      return this.error(`Failed to retrieve categories: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
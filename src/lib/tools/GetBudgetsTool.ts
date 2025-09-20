// Get Budgets Tool
// Handles retrieval of all budgets with spending information

import { BaseTool, ToolResult, ToolParameters } from './BaseTool'

export class GetBudgetsTool extends BaseTool {
  readonly name = 'get_budgets'
  readonly description = 'Retrieve all budgets with current spending and remaining amounts'
  
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {}
  }

  async execute(args: Record<string, any>, context?: any): Promise<ToolResult> {
    try {
      // This would normally call the actual budget retrieval service
      // For now, we'll simulate the operation with mock data
      const mockBudgets = [
        {
          id: 'budget_001',
          name: 'Monthly Groceries',
          amount: 500.00,
          category: 'food',
          period: 'monthly',
          spent: 320.50,
          remaining: 179.50,
          percentage_used: 64.1,
          created_at: '2024-01-01T00:00:00Z',
          period_start: '2024-01-01T00:00:00Z',
          period_end: '2024-01-31T23:59:59Z',
          status: 'active'
        },
        {
          id: 'budget_002',
          name: 'Entertainment',
          amount: 200.00,
          category: 'entertainment',
          period: 'monthly',
          spent: 85.00,
          remaining: 115.00,
          percentage_used: 42.5,
          created_at: '2024-01-01T00:00:00Z',
          period_start: '2024-01-01T00:00:00Z',
          period_end: '2024-01-31T23:59:59Z',
          status: 'active'
        },
        {
          id: 'budget_003',
          name: 'Transportation',
          amount: 150.00,
          category: 'transport',
          period: 'monthly',
          spent: 165.00,
          remaining: -15.00,
          percentage_used: 110.0,
          created_at: '2024-01-01T00:00:00Z',
          period_start: '2024-01-01T00:00:00Z',
          period_end: '2024-01-31T23:59:59Z',
          status: 'over_budget'
        }
      ]

      // Calculate summary statistics
      const totalBudgeted = mockBudgets.reduce((sum, budget) => sum + budget.amount, 0)
      const totalSpent = mockBudgets.reduce((sum, budget) => sum + budget.spent, 0)
      const totalRemaining = mockBudgets.reduce((sum, budget) => sum + budget.remaining, 0)
      const overBudgetCount = mockBudgets.filter(budget => budget.remaining < 0).length

      return this.success(
        {
          budgets: mockBudgets,
          summary: {
            total_budgets: mockBudgets.length,
            total_budgeted: totalBudgeted,
            total_spent: totalSpent,
            total_remaining: totalRemaining,
            overall_percentage_used: Math.round((totalSpent / totalBudgeted) * 100),
            over_budget_count: overBudgetCount
          }
        },
        `Retrieved ${mockBudgets.length} budget${mockBudgets.length !== 1 ? 's' : ''}. Total budgeted: $${totalBudgeted.toFixed(2)}, spent: $${totalSpent.toFixed(2)}${overBudgetCount > 0 ? `, ${overBudgetCount} over budget` : ''}`
      )
    } catch (error) {
      return this.error(`Failed to retrieve budgets: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
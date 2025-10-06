// Create Category Tool
// Handles creation of new transaction categories

import { BaseTool, ToolResult, ToolParameters } from './BaseTool'

export class CreateCategoryTool extends BaseTool {
  readonly name = 'create_category'
  readonly description = 'Create a new transaction category for better organization'
  
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Category name (e.g., "Groceries", "Transportation")'
      },
      type: {
        type: 'string',
        description: 'Category type',
        enum: ['income', 'expense']
      },
      description: {
        type: 'string',
        description: 'Optional description of the category'
      }
    },
    required: ['name', 'type']
  }

  async execute(args: Record<string, any>, context?: any): Promise<ToolResult> {
    // Validate required parameters
    const validationError = this.validateRequired(args, ['name', 'type'])
    if (validationError) {
      return this.error(validationError)
    }

    // Validate type
    if (!['income', 'expense'].includes(args.type)) {
      return this.error('Category type must be either "income" or "expense"')
    }

    // Validate name (should not be empty and reasonable length)
    if (typeof args.name !== 'string' || args.name.trim().length === 0) {
      return this.error('Category name cannot be empty')
    }

    if (args.name.length > 50) {
      return this.error('Category name must be 50 characters or less')
    }

    try {
      // This would normally call the actual category creation service
      // For now, we'll simulate the operation
      const category = {
        id: `category_${Date.now()}`,
        name: args.name.trim(),
        type: args.type,
        description: args.description || '',
        created_at: new Date().toISOString(),
        transaction_count: 0, // New category starts with no transactions
        is_active: true
      }

      return this.success(
        category,
        `Successfully created ${args.type} category "${args.name}"${args.description ? ` - ${args.description}` : ''}`
      )
    } catch (error) {
      return this.error(`Failed to create category: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
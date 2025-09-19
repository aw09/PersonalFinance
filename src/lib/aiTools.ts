// AI Tools Definition and Management System
// Separates tool definitions from execution logic

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required?: string[]
  }
}

export interface ToolCall {
  name: string
  arguments: Record<string, any>
}

export interface ToolResult {
  success: boolean
  data?: any
  message?: string
  error?: string
}

// Personal Finance Tools Definitions
export const FINANCIAL_TOOLS: ToolDefinition[] = [
  {
    name: 'add_transaction',
    description: 'Add a new financial transaction (income or expense) to a wallet',
    parameters: {
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
  },
  {
    name: 'create_wallet',
    description: 'Create a new financial wallet or account',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the wallet (e.g., "Savings Account", "Credit Card")'
        },
        currency: {
          type: 'string',
          description: 'Currency code for the wallet (e.g., USD, EUR, IDR)'
        },
        balance: {
          type: 'number',
          description: 'Initial balance for the wallet (optional, defaults to 0)'
        }
      },
      required: ['name', 'currency']
    }
  },
  {
    name: 'update_wallet',
    description: 'Update an existing wallet properties like currency or name',
    parameters: {
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
  },
  {
    name: 'get_transactions',
    description: 'Retrieve recent transactions with optional filtering',
    parameters: {
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
  },
  {
    name: 'get_wallets',
    description: 'Retrieve all user wallets with balances and basic information',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'create_budget',
    description: 'Create a new budget for expense tracking and limits',
    parameters: {
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
  },
  {
    name: 'get_budgets',
    description: 'Retrieve all budgets with current spending and remaining amounts',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'create_category',
    description: 'Create a new transaction category for better organization',
    parameters: {
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
  },
  {
    name: 'get_categories',
    description: 'Retrieve all available transaction categories',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Filter by category type (optional)',
          enum: ['income', 'expense']
        }
      }
    }
  }
]

// Tool execution mapping - separates tool calls from definitions
export const TOOL_EXECUTORS: Record<string, (args: any, context: any) => Promise<ToolResult>> = {}

// Helper function to find tool by name
export function findTool(name: string): ToolDefinition | null {
  return FINANCIAL_TOOLS.find(tool => tool.name === name) || null
}

// Helper function to validate tool arguments
export function validateToolArguments(tool: ToolDefinition, args: Record<string, any>): boolean {
  const required = tool.parameters.required || []
  return required.every(param => args.hasOwnProperty(param))
}

// Generate tool descriptions for prompt
export function generateToolDescriptions(): string {
  return FINANCIAL_TOOLS.map(tool => {
    const params = Object.entries(tool.parameters.properties)
      .map(([name, prop]) => `${name}: ${prop.description}`)
      .join(', ')
    
    return `${tool.name}: ${tool.description}. Parameters: ${params}`
  }).join('\n')
}
// Tools Registry - Dynamic Tool Discovery System
// Automatically discovers and registers all tools from the tools folder

import { BaseTool } from './tools/BaseTool'

// Import all tool classes
import { AddTransactionTool } from './tools/AddTransactionTool'
import { CreateWalletTool } from './tools/CreateWalletTool'
import { UpdateWalletTool } from './tools/UpdateWalletTool'
import { GetTransactionsTool } from './tools/GetTransactionsTool'
import { GetWalletsTool } from './tools/GetWalletsTool'
import { CreateBudgetTool } from './tools/CreateBudgetTool'
import { GetBudgetsTool } from './tools/GetBudgetsTool'
import { CreateCategoryTool } from './tools/CreateCategoryTool'
import { GetCategoriesTool } from './tools/GetCategoriesTools'

// Registry to store all available tools
class ToolsRegistry {
  private tools: Map<string, BaseTool> = new Map()
  private initialized = false

  // Initialize the registry with all available tools
  initialize() {
    if (this.initialized) return

    // Register all tool instances
    const toolInstances: BaseTool[] = [
      new AddTransactionTool(),
      new CreateWalletTool(),
      new UpdateWalletTool(),
      new GetTransactionsTool(),
      new GetWalletsTool(),
      new CreateBudgetTool(),
      new GetBudgetsTool(),
      new CreateCategoryTool(),
      new GetCategoriesTool()
    ]

    // Add each tool to the registry
    for (const tool of toolInstances) {
      this.tools.set(tool.name, tool)
    }

    this.initialized = true
    console.log(`Tools Registry initialized with ${this.tools.size} tools`)
  }

  // Get all available tools
  getAllTools(): BaseTool[] {
    this.initialize()
    return Array.from(this.tools.values())
  }

  // Get tool by name
  getTool(name: string): BaseTool | null {
    this.initialize()
    return this.tools.get(name) || null
  }

  // Get all tool definitions for AI prompts
  getToolDefinitions() {
    return this.getAllTools().map(tool => tool.getDefinition())
  }

  // Generate tool descriptions for prompts
  generateToolDescriptions(): string {
    return this.getAllTools().map(tool => {
      const params = tool.getParameterDescription()
      return `${tool.name}: ${tool.description}. Parameters: ${params}`
    }).join('\n')
  }

  // Validate if a tool exists
  hasToolToolName(name: string): boolean {
    this.initialize()
    return this.tools.has(name)
  }

  // Get tool names list
  getToolNames(): string[] {
    this.initialize()
    return Array.from(this.tools.keys())
  }

  // Execute a tool with arguments
  async executeTool(name: string, args: Record<string, any>, context?: any) {
    const tool = this.getTool(name)
    if (!tool) {
      throw new Error(`Tool not found: ${name}`)
    }

    // Validate arguments
    if (!tool.validateArguments(args)) {
      throw new Error(`Invalid arguments for tool ${name}`)
    }

    return await tool.execute(args, context)
  }

  // Get tools by category or type
  getToolsByCategory(category: 'create' | 'get' | 'update'): BaseTool[] {
    return this.getAllTools().filter(tool => {
      switch (category) {
        case 'create':
          return tool.name.startsWith('create_')
        case 'get':
          return tool.name.startsWith('get_')
        case 'update':
          return tool.name.startsWith('update_')
        default:
          return false
      }
    })
  }

  // Health check - verify all tools are properly registered
  healthCheck(): { healthy: boolean, issues: string[] } {
    const issues: string[] = []
    
    try {
      this.initialize()
      
      // Check if we have tools
      if (this.tools.size === 0) {
        issues.push('No tools registered')
      }

      // Validate each tool
      this.tools.forEach((tool, name) => {
        if (!tool.name) {
          issues.push(`Tool ${name} missing name property`)
        }
        if (!tool.description) {
          issues.push(`Tool ${name} missing description`)
        }
        if (!tool.parameters) {
          issues.push(`Tool ${name} missing parameters`)
        }
      })

      return {
        healthy: issues.length === 0,
        issues
      }
    } catch (error) {
      return {
        healthy: false,
        issues: [`Registry health check failed: ${error}`]
      }
    }
  }
}

// Export singleton instance
export const toolsRegistry = new ToolsRegistry()

// Legacy exports for backward compatibility
export const FINANCIAL_TOOLS = toolsRegistry.getToolDefinitions()
export const findTool = (name: string) => {
  const tool = toolsRegistry.getTool(name)
  return tool ? tool.getDefinition() : null
}
export const validateToolArguments = (toolDef: any, args: Record<string, any>) => {
  const tool = toolsRegistry.getTool(toolDef.name)
  return tool ? tool.validateArguments(args) : false
}
export const generateToolDescriptions = () => toolsRegistry.generateToolDescriptions()

// Re-export types for compatibility
export type { ToolCall, ToolResult } from './tools/BaseTool'
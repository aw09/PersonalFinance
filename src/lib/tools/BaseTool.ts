// Base Tool Abstract Class
// All financial tools extend this class for consistent interface

export interface ToolParameters {
  type: 'object'
  properties: Record<string, {
    type: string
    description: string
    enum?: string[]
  }>
  required?: string[]
}

export interface ToolResult {
  success: boolean
  data?: any
  message?: string
  error?: string
}

export interface ToolCall {
  name: string
  arguments: Record<string, any>
}

export abstract class BaseTool {
  abstract readonly name: string
  abstract readonly description: string
  abstract readonly parameters: ToolParameters

  // Validate tool arguments against schema
  validateArguments(args: Record<string, any>): boolean {
    const required = this.parameters.required || []
    return required.every(param => args.hasOwnProperty(param))
  }

  // Get tool definition for AI prompt
  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters
    }
  }

  // Generate parameter description for prompts
  getParameterDescription(): string {
    return Object.entries(this.parameters.properties)
      .map(([name, prop]) => `${name} (${prop.type}): ${prop.description}`)
      .join(', ')
  }

  // Abstract execute method - each tool implements its own logic
  abstract execute(args: Record<string, any>, context?: any): Promise<ToolResult>

  // Helper method to create success result
  protected success(data?: any, message?: string): ToolResult {
    return { success: true, data, message }
  }

  // Helper method to create error result
  protected error(error: string, data?: any): ToolResult {
    return { success: false, error, data }
  }

  // Helper method to validate required parameters
  protected validateRequired(args: Record<string, any>, required: string[]): string | null {
    for (const param of required) {
      if (!args.hasOwnProperty(param) || args[param] === undefined || args[param] === null) {
        return `Missing required parameter: ${param}`
      }
    }
    return null
  }
}
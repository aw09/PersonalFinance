// Tools Selection Agent
// Intelligently selects and orchestrates multiple tools for complex queries

import { generateGeminiReply } from './gemini'
import { FINANCIAL_TOOLS, findTool, validateToolArguments, ToolCall, ToolResult } from './aiTools'

export interface ToolSelectionResult {
  selectedTools: ToolCall[]
  executionPlan: ExecutionStep[]
  reasoning: string
  confidence: number
  fallbackPlan?: ToolCall[]
}

export interface ExecutionStep {
  stepNumber: number
  toolCall: ToolCall
  description: string
  dependsOn?: number[]
  isOptional: boolean
}

export interface UserContext {
  hasWallets: boolean
  hasTransactions: boolean
  hasBudgets: boolean
  hasCategories: boolean
  defaultCurrency?: string
  recentActivity?: string[]
}

// Main tool selection function
export async function selectTools(
  userQuery: string,
  context: UserContext,
  options: {
    maxTools?: number
    allowParallel?: boolean
    userId?: string
  } = {}
): Promise<ToolSelectionResult> {
  const { maxTools = 5, allowParallel = true, userId } = options

  try {
    // Step 1: Analyze query intent and complexity
    const queryAnalysis = await analyzeQueryComplexity(userQuery, context, userId)
    
    // Step 2: Generate tool selection using AI
    const toolSelection = await generateToolSelection(userQuery, context, queryAnalysis, userId)
    
    // Step 3: Validate and optimize tool selection
    const optimizedSelection = optimizeToolSelection(toolSelection, context, maxTools)
    
    // Step 4: Create execution plan
    const executionPlan = createExecutionPlan(optimizedSelection.selectedTools, allowParallel)
    
    return {
      ...optimizedSelection,
      executionPlan
    }
  } catch (error) {
    console.error('Tool selection error:', error)
    return getFallbackToolSelection(userQuery, context)
  }
}

// Analyze query complexity and requirements
async function analyzeQueryComplexity(
  userQuery: string, 
  context: UserContext, 
  userId?: string
): Promise<QueryAnalysis> {
  const analysisPrompt = `Analyze this personal finance query to understand what tools and data are needed.

User Query: "${userQuery}"

User Context:
- Has wallets: ${context.hasWallets}
- Has transactions: ${context.hasTransactions}
- Has budgets: ${context.hasBudgets}
- Has categories: ${context.hasCategories}
- Default currency: ${context.defaultCurrency || 'Unknown'}

Available Tools:
${FINANCIAL_TOOLS.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

Analyze and respond with JSON:
{
  "complexity": "simple" | "moderate" | "complex",
  "primaryIntent": "string describing main goal",
  "requiredData": ["list", "of", "data", "types", "needed"],
  "suggestedTools": ["tool1", "tool2"],
  "isMultiStep": boolean,
  "needsContext": boolean,
  "estimatedTools": number
}

Consider:
- Simple: Single tool, direct action (e.g., "add transaction")
- Moderate: 2-3 tools, some context needed (e.g., "show spending this month")
- Complex: Multiple tools, data aggregation, analysis (e.g., "compare my spending across categories and suggest budget adjustments")`

  try {
    const response = await generateGeminiReply(analysisPrompt, {
      userId,
      intent: 'query_analysis'
    })

    const analysis = extractJSON(response.text)
    return analysis || getDefaultAnalysis(userQuery)
  } catch (error) {
    console.error('Query analysis error:', error)
    return getDefaultAnalysis(userQuery)
  }
}

// Generate tool selection using AI
async function generateToolSelection(
  userQuery: string,
  context: UserContext,
  analysis: QueryAnalysis,
  userId?: string
): Promise<ToolSelectionResult> {
  const selectionPrompt = `Based on the query analysis, select the optimal tools and parameters.

User Query: "${userQuery}"
Query Analysis: ${JSON.stringify(analysis, null, 2)}

Available Tools:
${FINANCIAL_TOOLS.map(tool => 
  `${tool.name}: ${tool.description}
  Parameters: ${Object.entries(tool.parameters.properties).map(([name, prop]) => 
    `${name} (${prop.type}): ${prop.description}`
  ).join(', ')}`
).join('\n\n')}

User Context: ${JSON.stringify(context, null, 2)}

Respond with JSON:
{
  "selectedTools": [
    {
      "name": "tool_name",
      "arguments": {"param1": "value1", "param2": "value2"}
    }
  ],
  "reasoning": "Explanation of tool selection",
  "confidence": 0.85,
  "fallbackPlan": [{"name": "alternative_tool", "arguments": {}}]
}

Guidelines:
1. Select tools in logical order
2. Extract parameters from user query when possible
3. Use context to fill missing parameters
4. Prefer fewer, more comprehensive tools over many small ones
5. Include fallback options for critical operations`

  try {
    const response = await generateGeminiReply(selectionPrompt, {
      userId,
      intent: 'tool_selection'
    })

    const selection = extractJSON(response.text)
    if (!selection || !selection.selectedTools) {
      return getFallbackToolSelection(userQuery, context)
    }

    return {
      selectedTools: selection.selectedTools || [],
      executionPlan: [], // Will be created later
      reasoning: selection.reasoning || 'AI-generated tool selection',
      confidence: selection.confidence || 0.5,
      fallbackPlan: selection.fallbackPlan || []
    }
  } catch (error) {
    console.error('Tool selection generation error:', error)
    return getFallbackToolSelection(userQuery, context)
  }
}

// Optimize and validate tool selection
function optimizeToolSelection(
  selection: ToolSelectionResult,
  context: UserContext,
  maxTools: number
): ToolSelectionResult {
  let optimizedTools = [...selection.selectedTools]

  // Remove invalid tools
  optimizedTools = optimizedTools.filter(toolCall => {
    const tool = findTool(toolCall.name)
    if (!tool) {
      console.warn(`Tool not found: ${toolCall.name}`)
      return false
    }
    return true
  })

  // Validate arguments
  optimizedTools = optimizedTools.map(toolCall => {
    const tool = findTool(toolCall.name)
    if (!tool) return toolCall

    // Fill in default values based on context
    const optimizedArgs = fillDefaultArguments(toolCall.arguments, tool, context)
    
    return {
      ...toolCall,
      arguments: optimizedArgs
    }
  })

  // Limit number of tools
  if (optimizedTools.length > maxTools) {
    optimizedTools = prioritizeTools(optimizedTools, context).slice(0, maxTools)
  }

  // Remove duplicates
  optimizedTools = removeDuplicateTools(optimizedTools)

  return {
    ...selection,
    selectedTools: optimizedTools
  }
}

// Create execution plan with dependencies
function createExecutionPlan(
  toolCalls: ToolCall[],
  allowParallel: boolean
): ExecutionStep[] {
  const steps: ExecutionStep[] = []

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i]
    const dependencies = findDependencies(toolCall, toolCalls.slice(0, i))
    
    steps.push({
      stepNumber: i + 1,
      toolCall,
      description: generateStepDescription(toolCall),
      dependsOn: dependencies,
      isOptional: isOptionalTool(toolCall)
    })
  }

  return steps
}

// Helper functions
function fillDefaultArguments(
  args: Record<string, any>,
  tool: any,
  context: UserContext
): Record<string, any> {
  const filledArgs = { ...args }

  // Add default currency if not specified
  if (tool.parameters.properties.currency && !filledArgs.currency && context.defaultCurrency) {
    filledArgs.currency = context.defaultCurrency
  }

  // Add default wallet if wallet operations and not specified
  if (tool.parameters.properties.wallet_name && !filledArgs.wallet_name && context.hasWallets) {
    filledArgs.wallet_name = 'main' // Default to main wallet
  }

  // Add default limits for get operations
  if (tool.parameters.properties.limit && !filledArgs.limit) {
    if (tool.name.includes('transaction')) {
      filledArgs.limit = 10
    } else {
      filledArgs.limit = 5
    }
  }

  return filledArgs
}

function prioritizeTools(tools: ToolCall[], context: UserContext): ToolCall[] {
  return tools.sort((a, b) => {
    const priorityA = getToolPriority(a, context)
    const priorityB = getToolPriority(b, context)
    return priorityB - priorityA
  })
}

function getToolPriority(toolCall: ToolCall, context: UserContext): number {
  // Higher numbers = higher priority
  const priorities: Record<string, number> = {
    // Data creation tools
    'add_transaction': 10,
    'create_wallet': 9,
    'create_budget': 8,
    'create_category': 7,
    
    // Data retrieval tools
    'get_transactions': 6,
    'get_wallets': 5,
    'get_budgets': 4,
    'get_categories': 3,
    
    // Update tools
    'update_wallet': 2
  }

  let basePriority = priorities[toolCall.name] || 1

  // Boost priority if user doesn't have required data
  if (toolCall.name === 'create_wallet' && !context.hasWallets) basePriority += 5
  if (toolCall.name === 'create_category' && !context.hasCategories) basePriority += 3
  if (toolCall.name === 'create_budget' && !context.hasBudgets) basePriority += 3

  return basePriority
}

function removeDuplicateTools(tools: ToolCall[]): ToolCall[] {
  const seen = new Set<string>()
  return tools.filter(tool => {
    const key = `${tool.name}-${JSON.stringify(tool.arguments)}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function findDependencies(toolCall: ToolCall, previousTools: ToolCall[]): number[] {
  const dependencies: number[] = []

  // Tools that depend on wallets existing
  const walletDependentTools = ['add_transaction', 'get_transactions', 'update_wallet']
  if (walletDependentTools.includes(toolCall.name)) {
    const walletCreationIndex = previousTools.findIndex(t => t.name === 'create_wallet')
    if (walletCreationIndex !== -1) {
      dependencies.push(walletCreationIndex + 1)
    }
  }

  // Tools that depend on categories existing
  if (toolCall.name === 'add_transaction' && toolCall.arguments.category) {
    const categoryCreationIndex = previousTools.findIndex(t => t.name === 'create_category')
    if (categoryCreationIndex !== -1) {
      dependencies.push(categoryCreationIndex + 1)
    }
  }

  return dependencies
}

function generateStepDescription(toolCall: ToolCall): string {
  const descriptions: Record<string, (args: any) => string> = {
    'add_transaction': (args) => `Add ${args.type} transaction for ${args.amount} - ${args.description}`,
    'create_wallet': (args) => `Create wallet "${args.name}" with currency ${args.currency}`,
    'create_budget': (args) => `Create ${args.period} budget "${args.name}" for ${args.amount}`,
    'get_transactions': (args) => `Retrieve ${args.limit || 10} recent transactions`,
    'get_wallets': () => 'Retrieve all wallets',
    'get_budgets': () => 'Retrieve all budgets',
    'create_category': (args) => `Create ${args.type} category "${args.name}"`,
    'update_wallet': (args) => `Update wallet "${args.current_name}"`
  }

  const generator = descriptions[toolCall.name]
  return generator ? generator(toolCall.arguments) : `Execute ${toolCall.name}`
}

function isOptionalTool(toolCall: ToolCall): boolean {
  // Tools that are nice to have but not critical
  const optionalTools = ['get_categories', 'create_category']
  return optionalTools.includes(toolCall.name)
}

function getFallbackToolSelection(userQuery: string, context: UserContext): ToolSelectionResult {
  const lowerQuery = userQuery.toLowerCase()
  const fallbackTools: ToolCall[] = []

  // Simple pattern matching for fallback
  if (lowerQuery.includes('add') && (lowerQuery.includes('transaction') || lowerQuery.includes('expense') || lowerQuery.includes('income'))) {
    fallbackTools.push({
      name: 'add_transaction',
      arguments: {
        amount: 0, // Will need user clarification
        description: 'Transaction',
        type: lowerQuery.includes('income') ? 'income' : 'expense',
        wallet_name: 'main'
      }
    })
  }

  if (lowerQuery.includes('show') || lowerQuery.includes('get') || lowerQuery.includes('list')) {
    if (lowerQuery.includes('transaction')) {
      fallbackTools.push({ name: 'get_transactions', arguments: { limit: 10 } })
    }
    if (lowerQuery.includes('wallet')) {
      fallbackTools.push({ name: 'get_wallets', arguments: {} })
    }
    if (lowerQuery.includes('budget')) {
      fallbackTools.push({ name: 'get_budgets', arguments: {} })
    }
  }

  return {
    selectedTools: fallbackTools,
    executionPlan: [],
    reasoning: 'Fallback tool selection based on keyword matching',
    confidence: 0.3
  }
}

function getDefaultAnalysis(userQuery: string): QueryAnalysis {
  return {
    complexity: 'simple',
    primaryIntent: 'Unknown financial operation',
    requiredData: ['user_context'],
    suggestedTools: ['get_wallets'],
    isMultiStep: false,
    needsContext: true,
    estimatedTools: 1
  }
}

function extractJSON(text: string): any {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1) return null
  const jsonStr = text.slice(first, last + 1)
  try {
    return JSON.parse(jsonStr)
  } catch (err) {
    return null
  }
}

interface QueryAnalysis {
  complexity: 'simple' | 'moderate' | 'complex'
  primaryIntent: string
  requiredData: string[]
  suggestedTools: string[]
  isMultiStep: boolean
  needsContext: boolean
  estimatedTools: number
}

// Utility function to validate selected tools
export function validateToolSelection(selection: ToolSelectionResult): boolean {
  return selection.selectedTools.every(toolCall => {
    const tool = findTool(toolCall.name)
    return tool && validateToolArguments(tool, toolCall.arguments)
  })
}

// Generate execution summary
export function generateExecutionSummary(plan: ExecutionStep[]): string {
  const totalSteps = plan.length
  const optionalSteps = plan.filter(step => step.isOptional).length
  const requiredSteps = totalSteps - optionalSteps

  return `Execution plan: ${requiredSteps} required step(s)${optionalSteps > 0 ? ` and ${optionalSteps} optional step(s)` : ''}`
}
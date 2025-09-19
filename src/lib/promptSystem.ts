// Prompt Construction System
// Separates prompt building from tool execution logic

import { FINANCIAL_TOOLS, generateToolDescriptions } from './aiTools'

export interface PromptContext {
  userMessage: string
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
  }>
  userProfile?: {
    hasWallets: boolean
    hasTransactions: boolean
    hasBudgets: boolean
    defaultCurrency?: string
  }
  availableTools: string[]
}

export interface SystemPrompt {
  content: string
  toolDescriptions: string
  examples: string
}

// Main prompt construction function
export function buildSystemPrompt(context: PromptContext): SystemPrompt {
  const { userMessage, userProfile, availableTools } = context

  const systemPrompt = `You are a Personal Finance Assistant AI that helps users manage their money, track expenses, create budgets, and make informed financial decisions.

## Your Capabilities:
- Analyze financial transactions and spending patterns  
- Help create and manage budgets
- Provide personalized financial advice
- Execute financial operations through tool calls
- Answer general questions about personal finance

## User Context:
${generateUserContext(userProfile)}

## Communication Guidelines:
- Be helpful, friendly, and professional
- Provide clear, actionable advice
- Use appropriate financial terminology
- Ask clarifying questions when needed
- Always be encouraging about financial goals

## Tool Usage:
When the user requests an action that requires data manipulation (adding transactions, creating wallets, etc.), you MUST use the appropriate tools. Always explain what you're doing and why.

Available Tools:
${generateToolDescriptions()}

## Response Format:
1. First, acknowledge the user's request
2. If tools are needed, explain what you'll do
3. Execute the necessary tool calls
4. Provide a summary of the results
5. Offer relevant advice or next steps

## Examples:
${generateExamplePrompts()}

Remember: Always prioritize the user's financial wellbeing and provide responsible advice.`

  return {
    content: systemPrompt,
    toolDescriptions: generateToolDescriptions(),
    examples: generateExamplePrompts()
  }
}

// Generate user-specific context
function generateUserContext(userProfile?: PromptContext['userProfile']): string {
  if (!userProfile) {
    return '- New user setting up their financial tracking'
  }

  const context = []
  
  if (userProfile.hasWallets) {
    context.push('- User has existing wallets/accounts')
  } else {
    context.push('- User needs to create their first wallet')
  }

  if (userProfile.hasTransactions) {
    context.push('- User has transaction history')
  } else {
    context.push('- User is starting to track transactions')
  }

  if (userProfile.hasBudgets) {
    context.push('- User has budgets set up')
  } else {
    context.push('- User may benefit from budget creation')
  }

  if (userProfile.defaultCurrency) {
    context.push(`- Default currency: ${userProfile.defaultCurrency}`)
  }

  return context.join('\n')
}

// Generate example interactions
function generateExamplePrompts(): string {
  return `
Example 1 - Adding Transaction:
User: "I spent $25 on lunch today"
Assistant: "I'll add that lunch expense to your wallet. Let me create a transaction for $25."
[Tool: add_transaction with amount: 25, description: "lunch", type: "expense"]
Result: "Added $25 lunch expense to your Main Wallet. Your remaining balance is $XXX."

Example 2 - Creating Budget:
User: "I want to set a monthly budget of $500 for groceries"
Assistant: "I'll create a monthly grocery budget of $500 for you."
[Tool: create_budget with name: "Groceries", amount: 500, period: "monthly"]
Result: "Created monthly grocery budget of $500. I'll help you track your spending against this limit."

Example 3 - Checking Finances:
User: "How much did I spend this month?"
Assistant: "Let me check your recent transactions to calculate your monthly spending."
[Tool: get_transactions with filter for current month]
Result: "This month you've spent $XXX across X transactions. Your biggest expense category was [category] at $XXX."
`
}

// Build user-specific prompt
export function buildUserPrompt(context: PromptContext): string {
  const { userMessage, conversationHistory } = context

  let prompt = userMessage

  // Add conversation context if available
  if (conversationHistory && conversationHistory.length > 0) {
    const recentHistory = conversationHistory
      .slice(-3) // Last 3 exchanges
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n')
    
    prompt = `Previous conversation:
${recentHistory}

Current message: ${userMessage}`
  }

  return prompt
}

// Generate intent analysis prompt
export function buildIntentAnalysisPrompt(userMessage: string): string {
  return `Analyze this user message and identify the intent and required parameters for personal finance operations.

User message: "${userMessage}"

Respond with JSON in this exact format:
{
  "intent": "intent_name",
  "confidence": 0.95,
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  },
  "needs_clarification": false,
  "clarification_question": "optional question if needs_clarification is true"
}

Available intents:
- add_transaction: User wants to record income or expense
- create_wallet: User wants to create a new account/wallet
- update_wallet: User wants to modify existing wallet
- get_transactions: User wants to view transaction history
- get_wallets: User wants to see their accounts
- create_budget: User wants to set spending limits
- get_budgets: User wants to view budget status
- create_category: User wants to organize transactions
- get_categories: User wants to see available categories
- general_question: User asks general financial advice
- greeting: User is greeting or starting conversation

Extract amounts, currencies, dates, and other relevant parameters accurately.`
}

// Build tool call prompt
export function buildToolCallPrompt(intent: string, parameters: Record<string, any>): string {
  return `Execute the following financial operation:

Intent: ${intent}
Parameters: ${JSON.stringify(parameters, null, 2)}

Use the appropriate tool from the available tools and return the result in a user-friendly format.`
}

// Validate prompt structure
export function validatePrompt(prompt: string): boolean {
  return prompt.length > 10 && prompt.length < 8000 // Basic validation
}
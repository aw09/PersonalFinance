// Agent Orchestrator
// Coordinates multiple specialized agents for comprehensive query processing

import { detectPromptInjection, isInputSafe, generateSecurityMessage } from './promptInjectionAgent'
import { selectTools, validateToolSelection } from './toolsSelectionAgent'
import { enhanceWithKnowledge } from './ragAgent'
import { processMultiModalInput } from './multiModalAgent'
import { calculateConfidenceScore, formatConfidenceScore } from './confidenceAgent'
import { generateGeminiReply } from './gemini'
import { logLLMUsage } from './llmLogger'

export interface OrchestrationRequest {
  userInput: string | File | ArrayBuffer
  userId: string
  telegramUserId?: number
  context: {
    hasWallets: boolean
    hasTransactions: boolean
    hasBudgets: boolean
    hasCategories: boolean
    defaultCurrency?: string
    experienceLevel?: 'beginner' | 'intermediate' | 'advanced'
    conversationHistory?: string[]
  }
  options: {
    includeConfidence?: boolean
    maxTools?: number
    enableRAG?: boolean
    securityLevel?: 'low' | 'medium' | 'high'
  }
}

export interface OrchestrationResult {
  finalResponse: string
  confidence?: {
    overall: number
    factors: Record<string, number>
    reasoning: string
  }
  security: {
    isSafe: boolean
    threatLevel: string
    message?: string
  }
  processing: {
    stepsExecuted: string[]
    toolsUsed: string[]
    knowledgeUsed: number
    totalTime: number
  }
  rawData?: {
    extractedText?: string
    structuredData?: any
    toolResults?: any[]
  }
}

// Main orchestration function
export async function orchestrateQuery(
  request: OrchestrationRequest
): Promise<OrchestrationResult> {
  const startTime = Date.now()
  const stepsExecuted: string[] = []
  const toolsUsed: string[] = []
  let knowledgeUsed = 0

  try {
    // Step 1: Security Check - Prompt Injection Detection
    stepsExecuted.push('security_check')
    let processedInput = typeof request.userInput === 'string' ? request.userInput : ''
    
    if (typeof request.userInput === 'string') {
      const securityResult = await detectPromptInjection(request.userInput, {
        useAIAnalysis: request.options.securityLevel !== 'low',
        userId: request.userId,
        context: 'financial'
      })

      if (!isInputSafe(securityResult)) {
        return {
          finalResponse: generateSecurityMessage(securityResult),
          security: {
            isSafe: false,
            threatLevel: securityResult.threatLevel,
            message: securityResult.reasoning
          },
          processing: {
            stepsExecuted,
            toolsUsed,
            knowledgeUsed,
            totalTime: Date.now() - startTime
          }
        }
      }

      // Use sanitized input if available
      processedInput = securityResult.sanitizedInput || request.userInput
    }

    // Step 2: MultiModal Processing (if input is not text)
    let extractedText = processedInput
    let structuredData: any = undefined

    if (typeof request.userInput !== 'string') {
      stepsExecuted.push('multimodal_processing')
      const multiModalResult = await processMultiModalInput(request.userInput, {
        extractStructuredData: true,
        userId: request.userId
      })

      extractedText = multiModalResult.extractedText
      structuredData = multiModalResult.extractedData

      // If we extracted a receipt, we might want to auto-create a transaction
      if (multiModalResult.contentType === 'receipt' && structuredData?.total) {
        processedInput = `Add a transaction for ${structuredData.total} ${structuredData.currency || 'USD'} at ${structuredData.merchant || 'Unknown Merchant'} with items: ${structuredData.items?.map((item: any) => item.description).join(', ') || 'Receipt items'}`
      } else {
        processedInput = `Process this information: ${extractedText}`
      }
    }

    // Step 3: RAG Enhancement (if enabled)
    let enhancedPrompt = processedInput
    if (request.options.enableRAG !== false) {
      stepsExecuted.push('knowledge_enhancement')
      const ragResult = await enhanceWithKnowledge({
        userQuery: processedInput,
        userProfile: {
          experienceLevel: request.context.experienceLevel || 'intermediate',
          interests: ['personal_finance', 'budgeting'],
          goals: ['financial_management']
        },
        conversationHistory: request.context.conversationHistory
      }, {
        userId: request.userId,
        maxChunks: 3
      })

      enhancedPrompt = ragResult.enhancedPrompt
      knowledgeUsed = ragResult.relevantKnowledge.length
    }

    // Step 4: Tool Selection
    stepsExecuted.push('tool_selection')
    const toolSelection = await selectTools(processedInput, {
      hasWallets: request.context.hasWallets,
      hasTransactions: request.context.hasTransactions,
      hasBudgets: request.context.hasBudgets,
      hasCategories: request.context.hasCategories,
      defaultCurrency: request.context.defaultCurrency
    }, {
      maxTools: request.options.maxTools || 3,
      userId: request.userId
    })

    toolsUsed.push(...toolSelection.selectedTools.map(tool => tool.name))

    // Step 5: Tool Execution and Response Generation
    let finalResponse: string
    let toolResults: any[] = []

    if (toolSelection.selectedTools.length > 0) {
      // Execute tools and generate response based on tool results
      stepsExecuted.push('tool_execution')
      toolResults = await executeTools(toolSelection.selectedTools, request)

      stepsExecuted.push('response_generation_with_tools')
      finalResponse = await generateFinalResponse(
        enhancedPrompt,
        toolResults,
        structuredData,
        request.userId
      )
    } else {
      // No tools selected - handle as general conversation/question
      stepsExecuted.push('general_response_generation')
      finalResponse = await generateGeneralResponse(
        enhancedPrompt,
        processedInput,
        request.context,
        request.userId
      )
    }

    // Step 6: Confidence Scoring (if requested)
    let confidenceResult: any = undefined
    if (request.options.includeConfidence) {
      stepsExecuted.push('confidence_scoring')
      confidenceResult = await calculateConfidenceScore({
        userQuery: processedInput,
        aiResponse: finalResponse,
        toolsUsed,
        dataRetrieved: toolResults.map(r => r.data).filter(Boolean),
        executionTime: Date.now() - startTime,
        hasErrors: toolResults.some(r => !r.success)
      }, request.userId)
    }

    // Step 7: Logging — use LLMUsageLogEntry shape (camelCase) and include metadata
    await logLLMUsage({
      userId: request.userId,
      telegramUserId: request.telegramUserId,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: processedInput,
      response: finalResponse,
      status: 'success',
      responseTimeMs: Date.now() - startTime,
      metadata: {
        toolsUsed,
        confidenceScore: confidenceResult?.overall,
        processingSteps: stepsExecuted,
        knowledgeChunksUsed: knowledgeUsed
      }
    })

    return {
      finalResponse,
      confidence: confidenceResult ? {
        overall: confidenceResult.overall,
        factors: confidenceResult.factors,
        reasoning: confidenceResult.reasoning
      } : undefined,
      security: {
        isSafe: true,
        threatLevel: 'none'
      },
      processing: {
        stepsExecuted,
        toolsUsed,
        knowledgeUsed,
        totalTime: Date.now() - startTime
      },
      rawData: {
        extractedText: typeof request.userInput !== 'string' ? extractedText : undefined,
        structuredData,
        toolResults
      }
    }

  } catch (error) {
    console.error('Orchestration error:', error)
    
    return {
      finalResponse: 'I apologize, but I encountered an error processing your request. Please try again with a simpler query.',
      security: {
        isSafe: true,
        threatLevel: 'none'
      },
      processing: {
        stepsExecuted,
        toolsUsed,
        knowledgeUsed,
        totalTime: Date.now() - startTime
      }
    }
  }
}

// Execute selected tools (placeholder - would integrate with existing tool execution)
async function executeTools(
  toolCalls: any[],
  request: OrchestrationRequest
): Promise<Array<{ success: boolean; data?: any; error?: string }>> {
  // This would integrate with the existing tool execution logic from geminiAgentV2
  // For now, return placeholder results
  return toolCalls.map(tool => ({
    success: true,
    data: { tool: tool.name, executed: true },
    message: `Executed ${tool.name} successfully`
  }))
}

// Generate final response combining all information
async function generateFinalResponse(
  enhancedPrompt: string,
  toolResults: any[],
  structuredData: any,
  userId: string
): Promise<string> {
  const responsePrompt = `You are a helpful personal finance assistant. Based on the enhanced prompt and tool execution results, provide a comprehensive and friendly response.

Enhanced Prompt: ${enhancedPrompt}

Tool Results: ${JSON.stringify(toolResults, null, 2)}

${structuredData ? `Structured Data Extracted: ${JSON.stringify(structuredData, null, 2)}` : ''}

Instructions:
1. Provide a direct answer to the user's question
2. Include specific information from the tool results
3. If structured data was extracted (like from a receipt), acknowledge it and explain what was processed
4. Offer relevant financial advice or next steps
5. Be encouraging and supportive
6. Use a friendly, conversational tone

Focus on being helpful and actionable while maintaining accuracy.`

  try {
    const response = await generateGeminiReply(responsePrompt, {
      userId,
      intent: 'final_response_generation'
    })

    return response.text
  } catch (error) {
    console.error('Final response generation error:', error)
    return 'I processed your request successfully, but encountered an issue generating the response. Please try asking your question again.'
  }
}

// Generate general response for questions that don't require tools
async function generateGeneralResponse(
  enhancedPrompt: string,
  originalQuery: string,
  context: OrchestrationRequest['context'],
  userId: string
): Promise<string> {
  const generalResponsePrompt = `You are a helpful personal finance assistant. The user has asked a general question that doesn't require specific financial tools or data operations.

Enhanced Prompt (with relevant financial knowledge): ${enhancedPrompt}

Original User Query: "${originalQuery}"

User Context:
- Has wallets: ${context.hasWallets}
- Has transactions: ${context.hasTransactions}
- Has budgets: ${context.hasBudgets}
- Default currency: ${context.defaultCurrency}
- Experience level: ${context.experienceLevel || 'intermediate'}

Instructions:
1. Answer the user's question directly and helpfully
2. Use the enhanced prompt (which includes relevant financial knowledge) to provide comprehensive advice
3. Be conversational and encouraging
4. Provide actionable financial advice when appropriate
5. If the question is about personal finance concepts, explain them clearly
6. If asked about the user's specific data but tools aren't needed, guide them on how to find the information
7. Don't mention that you couldn't use tools - just focus on providing the best answer possible

Respond naturally as a knowledgeable personal finance assistant.`

  try {
    const response = await generateGeminiReply(generalResponsePrompt, {
      userId,
      intent: 'general_conversation'
    })

    return response.text
  } catch (error) {
    console.error('General response generation error:', error)
    return 'I\'m here to help with your personal finance questions! Could you please rephrase your question so I can provide you with the best advice?'
  }
}

// Simplified orchestration for text-only inputs
export async function orchestrateTextQuery(
  userQuery: string,
  userId: string,
  context: OrchestrationRequest['context'],
  options: Partial<OrchestrationRequest['options']> = {}
): Promise<string> {
  const request: OrchestrationRequest = {
    userInput: userQuery,
    userId,
    context,
    options: {
      includeConfidence: false,
      enableRAG: true,
      securityLevel: 'medium',
      ...options
    }
  }

  const result = await orchestrateQuery(request)
  return result.finalResponse
}

// Simplified orchestration for multimodal inputs (images, receipts)
export async function orchestrateMultiModalQuery(
  input: File | ArrayBuffer,
  userId: string,
  context: OrchestrationRequest['context'],
  options: Partial<OrchestrationRequest['options']> = {}
): Promise<OrchestrationResult> {
  const request: OrchestrationRequest = {
    userInput: input,
    userId,
    context,
    options: {
      includeConfidence: true,
      enableRAG: false, // Usually not needed for receipt processing
      securityLevel: 'low', // Images are generally safe
      maxTools: 2, // Usually just need add_transaction or similar
      ...options
    }
  }

  return await orchestrateQuery(request)
}

// Health check for all agents
export async function performAgentHealthCheck(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  agents: Record<string, boolean>
  details: string[]
}> {
  const agentTests = {
    promptInjection: testPromptInjectionAgent,
    toolsSelection: testToolsSelectionAgent,
    rag: testRAGAgent,
    multiModal: testMultiModalAgent,
    confidence: testConfidenceAgent
  }

  const results: Record<string, boolean> = {}
  const details: string[] = []

  for (const [agentName, testFunction] of Object.entries(agentTests)) {
    try {
      const isHealthy = await testFunction()
      results[agentName] = isHealthy
      if (!isHealthy) {
        details.push(`${agentName} agent is not functioning properly`)
      }
    } catch (error) {
      results[agentName] = false
      const err = error instanceof Error ? error : new Error(String(error))
      details.push(`${agentName} agent threw an error: ${err.message}`)
    }
  }

  const healthyCount = Object.values(results).filter(Boolean).length
  const totalCount = Object.keys(results).length

  let status: 'healthy' | 'degraded' | 'unhealthy'
  if (healthyCount === totalCount) {
    status = 'healthy'
  } else if (healthyCount >= totalCount * 0.6) {
    status = 'degraded'
  } else {
    status = 'unhealthy'
  }

  return {
    status,
    agents: results,
    details
  }
}

// Agent health check functions
async function testPromptInjectionAgent(): Promise<boolean> {
  try {
    const result = await detectPromptInjection('Hello, what is my balance?', { useAIAnalysis: false })
    return result.isSafe === true
  } catch {
    return false
  }
}

async function testToolsSelectionAgent(): Promise<boolean> {
  try {
    const result = await selectTools('Show my transactions', {
      hasWallets: true,
      hasTransactions: true,
      hasBudgets: false,
      hasCategories: false
    })
    return result.selectedTools.length > 0
  } catch {
    return false
  }
}

async function testRAGAgent(): Promise<boolean> {
  try {
    const result = await enhanceWithKnowledge({
      userQuery: 'How should I budget?'
    })
    return result.relevantKnowledge.length > 0
  } catch {
    return false
  }
}

async function testMultiModalAgent(): Promise<boolean> {
  try {
    const result = await processMultiModalInput('Test text input')
    return result.extractedText === 'Test text input'
  } catch {
    return false
  }
}

async function testConfidenceAgent(): Promise<boolean> {
  try {
    const result = await calculateConfidenceScore({
      userQuery: 'test',
      aiResponse: 'test response',
      toolsUsed: [],
      dataRetrieved: [],
      executionTime: 100,
      hasErrors: false
    })
    return typeof result.overall === 'number' && result.overall >= 0 && result.overall <= 100
  } catch {
    return false
  }
}

// Generate processing summary for users
export function generateProcessingSummary(result: OrchestrationResult): string {
  const { processing, security } = result
  
  let summary = `✅ Processed successfully in ${processing.totalTime}ms using ${processing.stepsExecuted.length} processing steps`
  
  if (processing.toolsUsed.length > 0) {
    summary += ` and ${processing.toolsUsed.length} financial tools`
  }
  
  if (processing.knowledgeUsed > 0) {
    summary += ` with ${processing.knowledgeUsed} knowledge sources`
  }
  
  if (!security.isSafe) {
    summary += `. ⚠️ Security issue detected: ${security.message}`
  }
  
  return summary
}
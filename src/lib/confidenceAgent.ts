// Confidence Scoring Agent
// Evaluates the quality and reliability of AI responses

import { generateGeminiReply } from './gemini'

export interface ConfidenceScore {
  overall: number // 0-100 percentage
  factors: {
    dataAvailability: number // How much relevant data was available
    contextRelevance: number // How relevant the response is to the query
    completeness: number // How complete the response is
    accuracy: number // Estimated accuracy based on data quality
  }
  reasoning: string
  suggestions?: string[]
}

export interface ResponseContext {
  userQuery: string
  aiResponse: string
  toolsUsed: string[]
  dataRetrieved: any[]
  executionTime: number
  hasErrors: boolean
}

// Main confidence evaluation function
export async function calculateConfidenceScore(
  context: ResponseContext,
  userId?: string
): Promise<ConfidenceScore> {
  const {
    userQuery,
    aiResponse,
    toolsUsed,
    dataRetrieved,
    executionTime,
    hasErrors
  } = context

  // Initial factor calculations
  let dataAvailability = calculateDataAvailability(dataRetrieved, toolsUsed)
  let contextRelevance = await calculateContextRelevance(userQuery, aiResponse, userId)
  let completeness = calculateCompleteness(userQuery, aiResponse, toolsUsed)
  let accuracy = calculateAccuracy(dataRetrieved, hasErrors, executionTime)

  // Calculate overall confidence (weighted average)
  const weights = {
    dataAvailability: 0.25,
    contextRelevance: 0.30,
    completeness: 0.25,
    accuracy: 0.20
  }

  const overall = Math.round(
    dataAvailability * weights.dataAvailability +
    contextRelevance * weights.contextRelevance +
    completeness * weights.completeness +
    accuracy * weights.accuracy
  )

  // Generate reasoning
  const reasoning = generateReasoning(overall, {
    dataAvailability,
    contextRelevance,
    completeness,
    accuracy
  })

  // Generate suggestions for improvement
  const suggestions = generateSuggestions({
    dataAvailability,
    contextRelevance,
    completeness,
    accuracy
  })

  return {
    overall: Math.max(0, Math.min(100, overall)),
    factors: {
      dataAvailability: Math.round(dataAvailability),
      contextRelevance: Math.round(contextRelevance),
      completeness: Math.round(completeness),
      accuracy: Math.round(accuracy)
    },
    reasoning,
    suggestions: suggestions.length > 0 ? suggestions : undefined
  }
}

// Calculate data availability score
function calculateDataAvailability(dataRetrieved: any[], toolsUsed: string[]): number {
  if (toolsUsed.length === 0) {
    return 70 // General knowledge response, medium confidence
  }

  let score = 100
  
  // Penalize if tools were called but no data retrieved
  if (toolsUsed.length > 0 && dataRetrieved.length === 0) {
    score -= 40
  }

  // Bonus for multiple data sources
  if (dataRetrieved.length > 1) {
    score += 10
  }

  // Check data quality
  const hasEmptyResults = dataRetrieved.some(data => 
    Array.isArray(data) ? data.length === 0 : !data
  )
  
  if (hasEmptyResults) {
    score -= 20
  }

  return Math.max(0, Math.min(100, score))
}

// Calculate context relevance using AI
async function calculateContextRelevance(
  userQuery: string, 
  aiResponse: string, 
  userId?: string
): Promise<number> {
  try {
    const relevancePrompt = `
Evaluate how relevant this AI response is to the user's query on a scale of 0-100.

User Query: "${userQuery}"
AI Response: "${aiResponse}"

Consider:
- Does the response directly address the user's question?
- Is the response appropriate for a personal finance context?
- Does it provide actionable or useful information?
- Is the tone and format appropriate?

Respond with just a number between 0-100.`

    const result = await generateGeminiReply(relevancePrompt, { 
      userId,
      intent: 'confidence_evaluation'
    })
    
    const score = parseInt(result.text.trim())
    return isNaN(score) ? 50 : Math.max(0, Math.min(100, score))
  } catch (error) {
    console.error('Error calculating context relevance:', error)
    return 50 // Default to medium confidence
  }
}

// Calculate completeness score
function calculateCompleteness(userQuery: string, aiResponse: string, toolsUsed: string[]): number {
  let score = 50 // Base score

  // Check response length (very short responses are often incomplete)
  if (aiResponse.length < 50) {
    score -= 30
  } else if (aiResponse.length > 200) {
    score += 20
  }

  // Check if response includes numbers/data when financial query
  const hasNumbers = /[\d$€£¥]+/.test(aiResponse)
  const isFinancialQuery = /money|dollar|budget|expense|income|transaction|wallet|balance/i.test(userQuery)
  
  if (isFinancialQuery && hasNumbers) {
    score += 20
  } else if (isFinancialQuery && !hasNumbers && toolsUsed.length > 0) {
    score -= 15
  }

  // Check if response provides actionable advice
  const hasActionableAdvice = /try|you can|consider|suggest|recommend/i.test(aiResponse)
  if (hasActionableAdvice) {
    score += 15
  }

  return Math.max(0, Math.min(100, score))
}

// Calculate accuracy score
function calculateAccuracy(dataRetrieved: any[], hasErrors: boolean, executionTime: number): number {
  let score = 100

  // Penalize for errors
  if (hasErrors) {
    score -= 40
  }

  // Penalize for very slow responses (might indicate issues)
  if (executionTime > 10000) { // 10 seconds
    score -= 15
  }

  // Penalize for inconsistent data
  if (dataRetrieved.length > 0) {
    const hasInconsistentData = dataRetrieved.some(data => {
      if (Array.isArray(data)) {
        return data.some(item => !item || typeof item !== 'object')
      }
      return false
    })
    
    if (hasInconsistentData) {
      score -= 20
    }
  }

  return Math.max(0, Math.min(100, score))
}

// Generate human-readable reasoning
function generateReasoning(overall: number, factors: Record<string, number>): string {
  if (overall >= 80) {
    return 'High confidence response with good data availability and relevance.'
  } else if (overall >= 60) {
    return 'Moderate confidence response. Some factors could be improved.'
  } else if (overall >= 40) {
    return 'Low confidence response. Limited data or relevance issues detected.'
  } else {
    return 'Very low confidence response. Significant issues with data or relevance.'
  }
}

// Generate improvement suggestions
function generateSuggestions(factors: Record<string, number>): string[] {
  const suggestions: string[] = []

  if (factors.dataAvailability < 60) {
    suggestions.push('Improve data retrieval by creating more financial records')
  }

  if (factors.contextRelevance < 60) {
    suggestions.push('Rephrase your question to be more specific about your financial needs')
  }

  if (factors.completeness < 60) {
    suggestions.push('Ask for more detailed information or specific examples')
  }

  if (factors.accuracy < 60) {
    suggestions.push('Verify the information with your actual financial records')
  }

  return suggestions.slice(0, 2) // Limit to 2 most important suggestions
}

// Helper function to format confidence score for display
export function formatConfidenceScore(score: ConfidenceScore): string {
  const emoji = score.overall >= 80 ? '🟢' : score.overall >= 60 ? '🟡' : '🔴'
  return `${emoji} Confidence: ${score.overall}% - ${score.reasoning}`
}
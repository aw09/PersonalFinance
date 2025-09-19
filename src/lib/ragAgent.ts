// RAG (Retrieval-Augmented Generation) Agent
// Enhances responses with relevant knowledge base information

import { generateGeminiReply } from './gemini'

export interface RAGResult {
  enhancedPrompt: string
  relevantKnowledge: KnowledgeChunk[]
  confidence: number
  sourceTypes: string[]
}

export interface KnowledgeChunk {
  id: string
  content: string
  source: string
  relevanceScore: number
  type: 'financial_tip' | 'best_practice' | 'explanation' | 'example' | 'warning'
  tags: string[]
}

export interface RAGContext {
  userQuery: string
  userProfile?: {
    experienceLevel: 'beginner' | 'intermediate' | 'advanced'
    interests: string[]
    goals: string[]
  }
  conversationHistory?: string[]
}

// Financial knowledge base
const FINANCIAL_KNOWLEDGE_BASE: KnowledgeChunk[] = [
  // Budgeting Knowledge
  {
    id: 'budget_50_30_20',
    content: 'The 50/30/20 rule is a popular budgeting method: allocate 50% of after-tax income to needs (rent, groceries, utilities), 30% to wants (entertainment, dining out), and 20% to savings and debt repayment. This provides a balanced approach to money management while ensuring you save for the future.',
    source: 'financial_planning_basics',
    relevanceScore: 0.9,
    type: 'best_practice',
    tags: ['budgeting', 'planning', 'savings', 'expenses']
  },
  {
    id: 'emergency_fund',
    content: 'An emergency fund should contain 3-6 months of living expenses in a easily accessible account. Start with $1,000 as an initial goal, then work toward the full amount. This fund protects you from unexpected expenses like medical bills, car repairs, or job loss without derailing your financial goals.',
    source: 'emergency_planning',
    relevanceScore: 0.85,
    type: 'best_practice',
    tags: ['emergency', 'savings', 'planning', 'security']
  },
  {
    id: 'debt_snowball',
    content: 'The debt snowball method involves paying minimum amounts on all debts, then putting extra money toward the smallest debt first. Once the smallest debt is paid off, apply that payment to the next smallest debt. This method provides psychological wins that help maintain motivation.',
    source: 'debt_management',
    relevanceScore: 0.8,
    type: 'financial_tip',
    tags: ['debt', 'payoff', 'strategy', 'motivation']
  },
  {
    id: 'debt_avalanche',
    content: 'The debt avalanche method involves paying minimum amounts on all debts, then putting extra money toward the debt with the highest interest rate. This method saves more money in interest over time compared to the snowball method, but may take longer to see individual debts disappear.',
    source: 'debt_management',
    relevanceScore: 0.8,
    type: 'financial_tip',
    tags: ['debt', 'payoff', 'strategy', 'interest']
  },
  {
    id: 'track_expenses',
    content: 'Tracking every expense for at least one month reveals spending patterns you might not notice otherwise. Use apps, spreadsheets, or even a notebook. Categorize expenses to see where your money goes. This awareness is the first step toward better financial control.',
    source: 'expense_management',
    relevanceScore: 0.85,
    type: 'best_practice',
    tags: ['tracking', 'expenses', 'awareness', 'budgeting']
  },

  // Investment Knowledge
  {
    id: 'diversification',
    content: 'Diversification means spreading investments across different asset classes (stocks, bonds, real estate) and sectors to reduce risk. Don\'t put all your money in one investment or one type of investment. The saying "don\'t put all your eggs in one basket" applies perfectly to investing.',
    source: 'investment_basics',
    relevanceScore: 0.75,
    type: 'explanation',
    tags: ['investing', 'risk', 'diversification', 'portfolio']
  },
  {
    id: 'dollar_cost_averaging',
    content: 'Dollar-cost averaging involves investing a fixed amount regularly regardless of market conditions. This strategy reduces the impact of market volatility and removes the stress of trying to time the market. It\'s particularly effective for long-term goals like retirement.',
    source: 'investment_strategies',
    relevanceScore: 0.7,
    type: 'financial_tip',
    tags: ['investing', 'strategy', 'volatility', 'regular']
  },
  {
    id: 'compound_interest',
    content: 'Compound interest is earning interest on both your original investment and previously earned interest. Starting early gives compound interest more time to work. Even small amounts invested regularly can grow significantly over decades due to compounding.',
    source: 'investment_fundamentals',
    relevanceScore: 0.8,
    type: 'explanation',
    tags: ['investing', 'compound', 'time', 'growth']
  },

  // Savings Knowledge
  {
    id: 'automated_savings',
    content: 'Automate your savings by setting up automatic transfers from checking to savings accounts. Treat savings like a bill that must be paid first. This "pay yourself first" approach ensures you save before you have a chance to spend the money elsewhere.',
    source: 'savings_strategies',
    relevanceScore: 0.8,
    type: 'best_practice',
    tags: ['savings', 'automation', 'habits', 'consistency']
  },
  {
    id: 'high_yield_savings',
    content: 'High-yield savings accounts offer significantly higher interest rates than traditional savings accounts. Look for accounts with no monthly fees, low minimum balances, and competitive APY. Online banks often offer better rates than traditional brick-and-mortar banks.',
    source: 'savings_optimization',
    relevanceScore: 0.7,
    type: 'financial_tip',
    tags: ['savings', 'interest', 'accounts', 'optimization']
  },

  // Warnings and Common Mistakes
  {
    id: 'lifestyle_inflation',
    content: 'Lifestyle inflation occurs when you increase spending as your income increases. This prevents you from building wealth even with a higher income. Try to maintain your current lifestyle when you get raises and put the extra money toward savings and investments instead.',
    source: 'wealth_building',
    relevanceScore: 0.75,
    type: 'warning',
    tags: ['spending', 'income', 'wealth', 'habits']
  },
  {
    id: 'credit_card_debt',
    content: 'Credit card debt typically carries high interest rates (15-25%+ APR) that compound daily. Pay off credit card balances in full each month if possible. If you carry a balance, focus on paying it off quickly as the interest charges can overwhelm your finances.',
    source: 'debt_management',
    relevanceScore: 0.9,
    type: 'warning',
    tags: ['credit', 'debt', 'interest', 'urgent']
  },

  // Transaction and Record Keeping
  {
    id: 'categorize_transactions',
    content: 'Categorizing transactions helps identify spending patterns and budget opportunities. Use consistent categories like Housing, Food, Transportation, Entertainment, and Personal Care. Review categories monthly to see where you might be overspending.',
    source: 'expense_tracking',
    relevanceScore: 0.8,
    type: 'best_practice',
    tags: ['transactions', 'categories', 'organization', 'analysis']
  },
  {
    id: 'receipt_organization',
    content: 'Keep receipts for tax-deductible expenses, warranty claims, and expense tracking. Consider using receipt scanning apps or taking photos for digital organization. Review receipts weekly to ensure all transactions are accurately recorded in your budget.',
    source: 'record_keeping',
    relevanceScore: 0.6,
    type: 'financial_tip',
    tags: ['receipts', 'organization', 'taxes', 'records']
  }
]

// Main RAG function
export async function enhanceWithKnowledge(
  context: RAGContext,
  options: {
    maxChunks?: number
    minRelevanceScore?: number
    userId?: string
  } = {}
): Promise<RAGResult> {
  const { maxChunks = 5, minRelevanceScore = 0.5, userId } = options

  try {
    // Step 1: Find relevant knowledge chunks
    const relevantChunks = await findRelevantKnowledge(
      context.userQuery,
      context.userProfile,
      minRelevanceScore
    )

    // Step 2: Rank and filter chunks
    const topChunks = rankKnowledgeChunks(relevantChunks, context).slice(0, maxChunks)

    // Step 3: Enhance the prompt with knowledge
    const enhancedPrompt = await buildEnhancedPrompt(context, topChunks, userId)

    return {
      enhancedPrompt,
      relevantKnowledge: topChunks,
      confidence: calculateRAGConfidence(topChunks, context.userQuery),
      sourceTypes: [...new Set(topChunks.map(chunk => chunk.type))]
    }
  } catch (error) {
    console.error('RAG enhancement error:', error)
    return {
      enhancedPrompt: context.userQuery,
      relevantKnowledge: [],
      confidence: 0.1,
      sourceTypes: []
    }
  }
}

// Find relevant knowledge chunks using keyword matching and semantic similarity
async function findRelevantKnowledge(
  query: string,
  userProfile?: RAGContext['userProfile'],
  minScore: number = 0.5
): Promise<KnowledgeChunk[]> {
  const queryLower = query.toLowerCase()
  const queryKeywords = extractKeywords(queryLower)

  const scoredChunks = FINANCIAL_KNOWLEDGE_BASE.map(chunk => {
    let score = 0

    // Keyword matching in content
    const contentScore = calculateKeywordMatch(queryKeywords, chunk.content.toLowerCase())
    score += contentScore * 0.4

    // Tag matching
    const tagScore = calculateTagMatch(queryKeywords, chunk.tags)
    score += tagScore * 0.3

    // Type relevance
    const typeScore = calculateTypeRelevance(queryLower, chunk.type)
    score += typeScore * 0.2

    // User profile matching
    if (userProfile) {
      const profileScore = calculateProfileMatch(userProfile, chunk)
      score += profileScore * 0.1
    }

    return {
      ...chunk,
      relevanceScore: Math.min(score, 1.0) // Cap at 1.0
    }
  })

  return scoredChunks.filter(chunk => chunk.relevanceScore >= minScore)
}

// Rank knowledge chunks by relevance and diversity
function rankKnowledgeChunks(chunks: KnowledgeChunk[], context: RAGContext): KnowledgeChunk[] {
  // Sort by relevance score
  let rankedChunks = [...chunks].sort((a, b) => b.relevanceScore - a.relevanceScore)

  // Promote diversity by type
  const typesSeen = new Set<string>()
  const diverseChunks: KnowledgeChunk[] = []
  const remainingChunks: KnowledgeChunk[] = []

  for (const chunk of rankedChunks) {
    if (!typesSeen.has(chunk.type) && diverseChunks.length < 3) {
      diverseChunks.push(chunk)
      typesSeen.add(chunk.type)
    } else {
      remainingChunks.push(chunk)
    }
  }

  // Combine diverse chunks first, then remaining by score
  return [...diverseChunks, ...remainingChunks]
}

// Build enhanced prompt with relevant knowledge
async function buildEnhancedPrompt(
  context: RAGContext,
  knowledgeChunks: KnowledgeChunk[],
  userId?: string
): Promise<string> {
  if (knowledgeChunks.length === 0) {
    return context.userQuery
  }

  const knowledgeContext = knowledgeChunks.map(chunk => 
    `${chunk.type.toUpperCase()}: ${chunk.content}`
  ).join('\n\n')

  const enhancedPrompt = `You are a personal finance assistant with access to relevant financial knowledge. Use this knowledge to provide comprehensive, accurate advice.

RELEVANT FINANCIAL KNOWLEDGE:
${knowledgeContext}

USER QUERY: ${context.userQuery}

${context.conversationHistory && context.conversationHistory.length > 0 ? 
  `CONVERSATION HISTORY: ${context.conversationHistory.slice(-3).join(' → ')}` : ''}

Instructions:
1. Answer the user's question directly and clearly
2. Incorporate relevant knowledge from the context above when appropriate
3. Provide actionable advice tailored to personal finance
4. Mention specific tips or best practices that apply
5. Be encouraging and supportive while being realistic
6. If the knowledge doesn't directly answer the question, use it to provide additional context or related advice

Respond in a helpful, friendly tone while maintaining financial accuracy.`

  return enhancedPrompt
}

// Helper functions for relevance scoring
function extractKeywords(text: string): string[] {
  // Remove common stop words and extract meaningful terms
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must'])
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10) // Limit to top 10 keywords
}

function calculateKeywordMatch(queryKeywords: string[], content: string): number {
  if (queryKeywords.length === 0) return 0

  let matchCount = 0
  for (const keyword of queryKeywords) {
    if (content.includes(keyword)) {
      matchCount++
    }
  }

  return matchCount / queryKeywords.length
}

function calculateTagMatch(queryKeywords: string[], tags: string[]): number {
  if (queryKeywords.length === 0 || tags.length === 0) return 0

  let matchCount = 0
  for (const keyword of queryKeywords) {
    for (const tag of tags) {
      if (tag.includes(keyword) || keyword.includes(tag)) {
        matchCount++
        break
      }
    }
  }

  return Math.min(matchCount / queryKeywords.length, 1.0)
}

function calculateTypeRelevance(query: string, type: string): number {
  const typeKeywords: Record<string, string[]> = {
    'financial_tip': ['tip', 'advice', 'suggest', 'recommend', 'help', 'how'],
    'best_practice': ['best', 'practice', 'should', 'method', 'way', 'approach'],
    'explanation': ['what', 'why', 'how', 'explain', 'understand', 'mean'],
    'example': ['example', 'show', 'demonstrate', 'instance'],
    'warning': ['avoid', 'mistake', 'danger', 'risk', 'careful', 'watch']
  }

  const keywords = typeKeywords[type] || []
  return keywords.some(keyword => query.includes(keyword)) ? 0.8 : 0.2
}

function calculateProfileMatch(profile: RAGContext['userProfile'], chunk: KnowledgeChunk): number {
  if (!profile) return 0.5

  let score = 0.5 // Base score

  // Experience level matching
  if (profile.experienceLevel === 'beginner' && chunk.type === 'explanation') {
    score += 0.3
  } else if (profile.experienceLevel === 'advanced' && chunk.type === 'best_practice') {
    score += 0.2
  }

  // Interest matching
  if (profile.interests) {
    const interestMatch = profile.interests.some(interest => 
      chunk.tags.some(tag => tag.includes(interest.toLowerCase()))
    )
    if (interestMatch) score += 0.2
  }

  return Math.min(score, 1.0)
}

function calculateRAGConfidence(chunks: KnowledgeChunk[], query: string): number {
  if (chunks.length === 0) return 0.1

  const avgRelevance = chunks.reduce((sum, chunk) => sum + chunk.relevanceScore, 0) / chunks.length
  const diversityBonus = new Set(chunks.map(c => c.type)).size * 0.1
  const quantityBonus = Math.min(chunks.length * 0.1, 0.3)

  return Math.min(avgRelevance + diversityBonus + quantityBonus, 1.0)
}

// Utility functions
export function getKnowledgeByTags(tags: string[]): KnowledgeChunk[] {
  return FINANCIAL_KNOWLEDGE_BASE.filter(chunk =>
    tags.some(tag => chunk.tags.includes(tag))
  )
}

export function getKnowledgeByType(type: KnowledgeChunk['type']): KnowledgeChunk[] {
  return FINANCIAL_KNOWLEDGE_BASE.filter(chunk => chunk.type === type)
}

export function addKnowledgeChunk(chunk: KnowledgeChunk): void {
  FINANCIAL_KNOWLEDGE_BASE.push(chunk)
}

// Get knowledge summary for user
export function getKnowledgeSummary(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) return 'No relevant knowledge found.'

  const types = [...new Set(chunks.map(c => c.type))]
  const sources = [...new Set(chunks.map(c => c.source))]
  
  return `Found ${chunks.length} relevant knowledge pieces covering ${types.join(', ')} from ${sources.length} source(s).`
}
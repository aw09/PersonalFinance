// API middleware utilities for handling common patterns
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser, createAuthSupabase, getAuthToken } from './authSupabase'
import { ValidationService } from '@/services/ValidationService'

export interface AuthenticatedRequest extends NextRequest {
  user: any
  supabase: any
}

/**
 * Higher-order function that wraps API handlers with authentication
 * Implements Single Responsibility Principle by separating auth concerns
 */
export function withAuth(
  handler: (request: AuthenticatedRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const user = await getSupabaseUser(request)
      if (!user) {
        return NextResponse.json({ error: 'Invalid or missing token' }, { status: 401 })
      }

      const token = getAuthToken(request)!
      const supabase = createAuthSupabase(token)

      // Extend request with auth data
      const authenticatedRequest = Object.assign(request, { user, supabase }) as AuthenticatedRequest

      return await handler(authenticatedRequest)
    } catch (error) {
      console.error('Authentication error:', error)
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }
  }
}

/**
 * Standard error response utility
 * Implements DRY principle by centralizing error responses
 */
export function createErrorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Standard success response utility
 * Implements DRY principle by centralizing success responses
 */
export function createSuccessResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status })
}

/**
 * Enhanced validation using ValidationService
 * Implements Single Responsibility Principle by separating validation logic
 */
export function validateRequiredFields(body: any, requiredFields: string[]): string | null {
  for (const field of requiredFields) {
    if (!body[field]) {
      return `${field} is required`
    }
  }
  return null
}

/**
 * Validate request body using ValidationService
 * Implements Dependency Inversion Principle by using the validation service
 */
export function validateRequestBody<T extends Record<string, any>>(
  body: T,
  entityType: 'wallet' | 'transaction' | 'budget'
): { isValid: boolean; errors: string[] } {
  switch (entityType) {
    case 'wallet':
      return ValidationService.validateWallet(body)
    case 'transaction':
      return ValidationService.validateTransaction(body)
    case 'budget':
      return ValidationService.validateBudget(body)
    default:
      return { isValid: true, errors: [] }
  }
}

/**
 * Centralized error handling wrapper
 * Implements DRY principle by standardizing error handling
 */
export async function withErrorHandling<T>(
  handler: () => Promise<NextResponse<T>>
): Promise<NextResponse<T | { error: string }>> {
  try {
    return await handler()
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error')
  }
}
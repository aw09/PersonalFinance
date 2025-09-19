'use client'

import React from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error?: Error; resetError: () => void }>
}

/**
 * Error Boundary component for catching and handling React errors
 * Implements Single Responsibility Principle by focusing solely on error handling
 * Follows the Open/Closed Principle by accepting custom fallback components
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback
      return <FallbackComponent error={this.state.error} resetError={this.resetError} />
    }

    return this.props.children
  }
}

/**
 * Default error fallback component
 * Implements KISS principle with simple, clear error display
 */
function DefaultErrorFallback({ error, resetError }: { error?: Error; resetError: () => void }) {
  return (
    <div className="card bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
      <div className="card-body text-center">
        <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
          Something went wrong
        </h2>
        <p className="text-red-700 dark:text-red-300 mb-4">
          {error?.message || 'An unexpected error occurred'}
        </p>
        <button onClick={resetError} className="btn-primary">
          Try again
        </button>
      </div>
    </div>
  )
}

/**
 * Hook for creating error boundaries with custom error handling
 * Implements DRY principle by providing reusable error boundary logic
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>, 
  fallback?: React.ComponentType<{ error?: Error; resetError: () => void }>
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    )
  }
}
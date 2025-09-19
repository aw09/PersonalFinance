'use client'

import React from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  showCloseButton?: boolean
}

/**
 * Reusable Modal component
 * Implements DRY principle by providing a single modal implementation
 * Implements Open/Closed Principle by accepting children and customization props
 * Implements KISS principle with simple, consistent modal behavior
 */
export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxWidth = 'md',
  showCloseButton = true 
}: ModalProps) {
  if (!isOpen) return null

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl'
  }

  return (
    <div className="modal-overlay flex items-center justify-center z-50">
      <div className={`modal-content w-full ${maxWidthClasses[maxWidth]} mx-4 max-h-[90vh] overflow-y-auto`}>
        {(title || showCloseButton) && (
          <div className="card-header flex items-center justify-between">
            {title && (
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/**
 * Modal Body component for consistent spacing
 */
export function ModalBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card-body ${className}`}>{children}</div>
}

/**
 * Modal Footer component for consistent button layouts
 */
export function ModalFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card-footer flex justify-end space-x-3 ${className}`}>{children}</div>
}
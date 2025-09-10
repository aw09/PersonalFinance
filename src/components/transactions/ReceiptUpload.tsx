'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Camera, Upload, Loader2, CheckCircle, XCircle } from 'lucide-react'

interface ReceiptUploadProps {
  walletId: string
  onTransactionCreated?: () => void
}

export default function ReceiptUpload({ walletId, onTransactionCreated }: ReceiptUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    await uploadReceipt(file)
  }

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (!file) return

    await uploadReceipt(file)
  }

  const uploadReceipt = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setMessage('Please select an image file')
      setUploadStatus('error')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage('File size must be less than 5MB')
      setUploadStatus('error')
      return
    }

    setIsUploading(true)
    setUploadStatus('uploading')
    setMessage('Uploading receipt...')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Please sign in to upload receipts')
      }

      const formData = new FormData()
      formData.append('receipt', file)
      formData.append('walletId', walletId)

      const response = await fetch('/api/receipts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Upload failed')
      }

      const result = await response.json()
      setReceiptId(result.receiptId)
      setUploadStatus('processing')
      setMessage('Analyzing receipt with AI...')

      // Poll for processing completion
      pollReceiptStatus(result.receiptId, session.access_token)

    } catch (error) {
      console.error('Upload error:', error)
      setMessage(error instanceof Error ? error.message : 'Upload failed')
      setUploadStatus('error')
    } finally {
      setIsUploading(false)
    }
  }

  const pollReceiptStatus = async (id: string, token: string) => {
    const maxAttempts = 30 // 30 attempts = ~30 seconds
    let attempts = 0

    const poll = async () => {
      attempts++
      try {
        const response = await fetch(`/api/receipts?id=${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (!response.ok) {
          throw new Error('Failed to check status')
        }

        const result = await response.json()
        const receipt = result.receipt

        if (receipt.processing_status === 'processed') {
          setUploadStatus('success')
          setMessage(`Transaction created successfully! ${receipt.llm_analysis_result?.merchant || 'Receipt'} - $${receipt.llm_analysis_result?.total || '0.00'}`)
          onTransactionCreated?.()
          return
        }

        if (receipt.processing_status === 'failed') {
          setUploadStatus('error')
          setMessage(receipt.error_message || 'Processing failed')
          return
        }

        // Continue polling if still processing
        if (attempts < maxAttempts && receipt.processing_status === 'processing') {
          setTimeout(poll, 1000) // Poll every second
        } else if (attempts >= maxAttempts) {
          setUploadStatus('error')
          setMessage('Processing timed out. Please try again.')
        }

      } catch (error) {
        console.error('Status check error:', error)
        setUploadStatus('error')
        setMessage('Failed to check processing status')
      }
    }

    poll()
  }

  const resetUpload = () => {
    setUploadStatus('idle')
    setMessage('')
    setReceiptId(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center gap-2 mb-4">
          <Camera className="h-5 w-5 text-primary-600" />
          <h3 className="text-lg font-semibold">Receipt Scanner</h3>
        </div>

        {uploadStatus === 'idle' && (
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              Drop receipt image here or click to select
            </p>
            <p className="text-sm text-gray-500">
              Supports JPG, PNG up to 5MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {uploadStatus !== 'idle' && (
          <div className="text-center py-8">
            {uploadStatus === 'uploading' && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                <p className="text-gray-600 dark:text-gray-400">{message}</p>
              </div>
            )}

            {uploadStatus === 'processing' && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                <p className="text-gray-600 dark:text-gray-400">{message}</p>
                <p className="text-sm text-gray-500">This may take a few seconds...</p>
              </div>
            )}

            {uploadStatus === 'success' && (
              <div className="flex flex-col items-center gap-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <p className="text-green-600 font-medium">{message}</p>
                <button
                  onClick={resetUpload}
                  className="btn-secondary"
                >
                  Upload Another Receipt
                </button>
              </div>
            )}

            {uploadStatus === 'error' && (
              <div className="flex flex-col items-center gap-4">
                <XCircle className="h-8 w-8 text-red-600" />
                <p className="text-red-600">{message}</p>
                <button
                  onClick={resetUpload}
                  className="btn-secondary"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
            How it works:
          </h4>
          <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <li>1. Upload a clear photo of your receipt</li>
            <li>2. Our AI extracts transaction details</li>
            <li>3. A new transaction is automatically created</li>
            <li>4. Review and edit the details if needed</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser, createAuthSupabase, getAuthToken } from '@/lib/authSupabase'
import { createClient } from '@supabase/supabase-js'
import { logLLMUsage } from '@/lib/llmLogger'
import { generateGeminiReply } from '@/lib/gemini'

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024

// POST /api/receipts - Upload receipt image and process with LLM
export async function POST(request: NextRequest) {
  try {
    const user = await getSupabaseUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Invalid or missing token' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('receipt') as File
    const walletId = formData.get('walletId') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!walletId) {
      return NextResponse.json({ error: 'Wallet ID is required' }, { status: 400 })
    }

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 })
    }

    const token = getAuthToken(request)
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const supabase = createAuthSupabase(token)
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }

    // Create Supabase client with service role for storage operations
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Generate unique filename
    const timestamp = Date.now()
    const fileExtension = file.name.split('.').pop() || 'jpg'
    const fileName = `receipt_${user.id}_${timestamp}.${fileExtension}`
    const storagePath = `receipts/${user.id}/${fileName}`

    // Upload file to Supabase storage
    const fileBuffer = await file.arrayBuffer()
    const { data: storageData, error: storageError } = await serviceSupabase.storage
      .from('receipt-images')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false
      })

    if (storageError) {
      console.error('Storage upload error:', storageError)
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    // Store receipt metadata in database
    const { data: receiptRecord, error: dbError } = await supabase
      .from('receipt_images')
      .insert({
        user_id: user.id,
        storage_path: storagePath,
        original_filename: file.name,
        content_type: file.type,
        file_size: file.size,
        processing_status: 'processing'
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      // Clean up uploaded file on database error
      await serviceSupabase.storage.from('receipt-images').remove([storagePath])
      return NextResponse.json({ error: 'Failed to save receipt record' }, { status: 500 })
    }

    // Process receipt with LLM in the background
    processReceiptWithLLM(receiptRecord.id, storagePath, walletId, user.id)
      .catch(error => console.error('Background receipt processing failed:', error))

    return NextResponse.json({
      success: true,
      receiptId: receiptRecord.id,
      message: 'Receipt uploaded and processing started'
    })

  } catch (error) {
    console.error('Receipt upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Background function to process receipt with LLM
async function processReceiptWithLLM(
  receiptId: string, 
  storagePath: string, 
  walletId: string, 
  userId: string
) {
  try {
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get signed URL for the image
    const { data: signedUrlData } = await serviceSupabase.storage
      .from('receipt-images')
      .createSignedUrl(storagePath, 60 * 60) // 1 hour expiry

    if (!signedUrlData?.signedUrl) {
      throw new Error('Failed to get signed URL for image')
    }

    // Prepare prompt for LLM analysis
    const prompt = `Analyze this receipt image and extract transaction details. Return a JSON object with:
{
  "merchant": "Store/restaurant name",
  "total": 25.50,
  "date": "2024-01-15",
  "items": [
    {"name": "Coffee", "quantity": 1, "price": 3.50},
    {"name": "Sandwich", "quantity": 1, "price": 12.00}
  ],
  "category": "Food & Dining",
  "type": "expense",
  "confidence": 0.95
}

Extract all visible items, prices, date, and merchant name. If unclear, use "Unknown" for merchant and estimate category. Set confidence between 0-1 based on image clarity.`

    // Send to LLM with image
    const startTime = Date.now()
    const geminiResponse = await generateGeminiReply(prompt, {
      userId,
      intent: 'receipt_analysis',
      imageUrl: signedUrlData.signedUrl
    })

    const responseTime = Date.now() - startTime
    
    // Parse LLM response
    let analysisResult
    try {
      analysisResult = JSON.parse(geminiResponse.text)
    } catch (parseError) {
      console.error('Failed to parse LLM response:', geminiResponse.text)
      throw new Error('Invalid LLM response format')
    }

    // Log LLM usage
    await logLLMUsage({
      userId,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: prompt.substring(0, 500) + '...',
      response: JSON.stringify(analysisResult),
      promptTokens: geminiResponse.promptTokens,
      completionTokens: geminiResponse.completionTokens,
      totalTokens: geminiResponse.totalTokens,
      responseTimeMs: responseTime,
      status: 'success',
      intentDetected: 'receipt_analysis',
      actionTaken: 'receipt_processed',
      metadata: { receiptId, imageUrl: signedUrlData.signedUrl }
    })

    // Create transaction from receipt analysis
    const transaction = await createTransactionFromReceipt(
      analysisResult, 
      walletId, 
      userId, 
      receiptId,
      serviceSupabase
    )

    // Update receipt processing status
    await serviceSupabase.rpc('update_receipt_processing_status', {
      receipt_id: receiptId,
      new_status: 'processed',
      analysis_result: analysisResult
    })

    // Update receipt with transaction ID
    await serviceSupabase
      .from('receipt_images')
      .update({ transaction_id: transaction.id })
      .eq('id', receiptId)

    console.log('Receipt processed successfully:', receiptId)

  } catch (error) {
    console.error('Receipt processing failed:', error)
    
    // Log failed LLM usage
    await logLLMUsage({
      userId,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: 'Receipt analysis (failed)',
      response: null,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
      intentDetected: 'receipt_analysis',
      actionTaken: 'processing_failed',
      metadata: { receiptId }
    })

    // Update processing status to failed
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await serviceSupabase.rpc('update_receipt_processing_status', {
      receipt_id: receiptId,
      new_status: 'failed',
      error_msg: error instanceof Error ? error.message : String(error)
    })
  }
}

// Helper function to create transaction from receipt analysis
async function createTransactionFromReceipt(
  analysis: any,
  walletId: string,
  userId: string,
  receiptId: string,
  supabase: any
) {
  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      wallet_id: walletId,
      amount: analysis.total || 0,
      description: `${analysis.merchant || 'Receipt'} - Receipt Transaction`,
      type: analysis.type || 'expense',
      date: analysis.date ? new Date(analysis.date).toISOString() : new Date().toISOString(),
      receipt_image_id: receiptId
    })
    .select()
    .single()

  if (transactionError) {
    throw new Error(`Failed to create transaction: ${transactionError.message}`)
  }

  // Create transaction items if available
  if (analysis.items && Array.isArray(analysis.items)) {
    const items = analysis.items.map((item: any) => ({
      transaction_id: transaction.id,
      name: item.name || 'Unknown Item',
      quantity: item.quantity || 1,
      unit_price: item.price || 0,
      total_price: (item.quantity || 1) * (item.price || 0)
    }))

    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from('transaction_items')
        .insert(items)

      if (itemsError) {
        console.error('Failed to create transaction items:', itemsError)
        // Don't throw error for items, main transaction is created
      }
    }
  }

  return transaction
}

// GET /api/receipts - Get receipt processing status
export async function GET(request: NextRequest) {
  try {
    const user = await getSupabaseUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Invalid or missing token' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const receiptId = searchParams.get('id')

    if (!receiptId) {
      return NextResponse.json({ error: 'Receipt ID is required' }, { status: 400 })
    }

    const token = getAuthToken(request)
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const supabase = createAuthSupabase(token)
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }

    const { data: receipt, error } = await supabase
      .from('receipt_images')
      .select(`
        *,
        transaction:transactions(*)
      `)
      .eq('id', receiptId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      receipt
    })

  } catch (error) {
    console.error('Receipt status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
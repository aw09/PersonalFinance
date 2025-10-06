-- Receipt Processing Migration
-- Add receipt storage and processing capabilities

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create receipt_images table to store receipt metadata and Supabase storage paths
CREATE TABLE IF NOT EXISTS receipt_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL, -- Path in Supabase storage
  original_filename TEXT,
  content_type TEXT,
  file_size INTEGER,
  processed_at TIMESTAMPTZ,
  processing_status TEXT CHECK (processing_status IN ('uploaded', 'processing', 'processed', 'failed')) DEFAULT 'uploaded',
  llm_analysis_result JSONB, -- Store the LLM analysis result
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add receipt_image_id column to transactions table to link back to receipt
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_image_id UUID REFERENCES receipt_images(id) ON DELETE SET NULL;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_receipt_images_user_id ON receipt_images(user_id);
CREATE INDEX IF NOT EXISTS idx_receipt_images_transaction_id ON receipt_images(transaction_id);
CREATE INDEX IF NOT EXISTS idx_receipt_images_processing_status ON receipt_images(processing_status);
CREATE INDEX IF NOT EXISTS idx_transactions_receipt_image_id ON transactions(receipt_image_id);

-- Enable RLS on receipt_images table
ALTER TABLE receipt_images ENABLE ROW LEVEL SECURITY;

-- Create policies for receipt_images
CREATE POLICY "Users can view own receipt images" ON receipt_images 
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own receipt images" ON receipt_images 
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own receipt images" ON receipt_images 
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own receipt images" ON receipt_images 
  FOR DELETE USING (user_id = auth.uid());

-- Create function to update receipt processing status
CREATE OR REPLACE FUNCTION update_receipt_processing_status(
  receipt_id UUID,
  new_status TEXT,
  analysis_result JSONB DEFAULT NULL,
  error_msg TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE receipt_images 
  SET 
    processing_status = new_status,
    llm_analysis_result = COALESCE(analysis_result, llm_analysis_result),
    error_message = error_msg,
    processed_at = CASE WHEN new_status = 'processed' THEN NOW() ELSE processed_at END,
    updated_at = NOW()
  WHERE id = receipt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION update_receipt_processing_status TO authenticated;
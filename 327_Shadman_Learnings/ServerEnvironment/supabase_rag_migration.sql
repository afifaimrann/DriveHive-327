-- Enable the vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add LLM settings columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS llm_provider TEXT DEFAULT 'gemini', -- 'openai', 'gemini', 'openrouter', 'ollama', 'custom'
ADD COLUMN IF NOT EXISTS llm_api_key TEXT,                 -- Encrypted
ADD COLUMN IF NOT EXISTS llm_endpoint TEXT,                -- e.g. http://localhost:11434 for Ollama
ADD COLUMN IF NOT EXISTS llm_model_name TEXT DEFAULT 'gemini-1.5-flash',
ADD COLUMN IF NOT EXISTS embedding_provider TEXT DEFAULT 'local', -- 'openai', 'gemini', 'local'
ADD COLUMN IF NOT EXISTS embedding_model_name TEXT DEFAULT 'all-MiniLM-L6-v2';

-- Create table to store document text chunks and embeddings (distinct from file_chunks)
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector, -- Dimension-free vector column (pgvector 0.5.0+)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on document_chunks
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for document_chunks
CREATE POLICY select_own_document_chunks ON document_chunks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY insert_own_document_chunks ON document_chunks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY delete_own_document_chunks ON document_chunks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_document_chunks_user_id ON document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_file_id ON document_chunks(file_id);

-- RPC Function for similarity matching
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector,
  match_threshold float,
  match_count int,
  p_user_id uuid,
  p_file_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  file_id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER -- Bypasses RLS strictly for the execution of this query function on behalf of the server
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_chunks.id AS chunk_id,
    document_chunks.file_id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE document_chunks.user_id = p_user_id
    AND (p_file_ids IS NULL OR document_chunks.file_id = ANY(p_file_ids))
    AND 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY document_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

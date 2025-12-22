-- Add pgvector extension and embedding column to papers table
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE papers 
ADD COLUMN IF NOT EXISTS embedding vector(3072);

-- Note: pgvector indexes (HNSW and IVFFlat) have a 2000 dimension limit.
-- gemini-embedding-001 produces 3072 dimensions by default, so we cannot use an index.
-- Similarity search will still work but will be slower (sequential scan).
-- Consider using outputDimensionality=768 if the API supports it, or use a different embedding model.

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_papers_tenant_embedding 
ON papers(tenant_id) 
WHERE embedding IS NOT NULL;

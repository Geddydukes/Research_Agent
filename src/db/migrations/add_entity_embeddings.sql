-- Add dual embedding columns to nodes table
-- embedding_raw: Full 3072 dimensions for precision
-- embedding_index: Reduced 768 dimensions for fast HNSW-indexed search
ALTER TABLE nodes 
ADD COLUMN IF NOT EXISTS embedding_raw vector(3072),
ADD COLUMN IF NOT EXISTS embedding_index vector(768);

-- Create HNSW index on reduced-dimension embedding for fast candidate search
CREATE INDEX IF NOT EXISTS idx_nodes_embedding_index_hnsw 
ON nodes 
USING hnsw (embedding_index vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE embedding_index IS NOT NULL;

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_nodes_tenant_embedding 
ON nodes(tenant_id) 
WHERE embedding_index IS NOT NULL;

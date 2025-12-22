-- Function to find similar papers using pgvector
-- Returns papers with similarity scores above threshold, ordered by similarity
CREATE OR REPLACE FUNCTION find_similar_papers(
  query_embedding vector(3072),
  similarity_threshold float DEFAULT 0.0,
  result_limit int DEFAULT 100,
  exclude_ids text[] DEFAULT ARRAY[]::text[],
  tenant_id_param text DEFAULT NULL
)
RETURNS TABLE (
  paper_id text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.paper_id,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM papers p
  WHERE 
    p.embedding IS NOT NULL
    AND (tenant_id_param IS NULL OR p.tenant_id::text = tenant_id_param)
    AND (exclude_ids IS NULL OR p.paper_id != ALL(exclude_ids))
    AND (1 - (p.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT result_limit;
END;
$$;

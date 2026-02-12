-- Function to find similar nodes using pgvector
-- Uses embedding_index (768 dims) for fast HNSW-indexed search
CREATE OR REPLACE FUNCTION find_similar_nodes(
  query_embedding_index vector(768),
  entity_type text,
  similarity_threshold float DEFAULT 0.0,
  result_limit int DEFAULT 50,
  exclude_ids int[] DEFAULT ARRAY[]::int[],
  tenant_id_param uuid DEFAULT NULL
)
RETURNS TABLE (
  node_id int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.id AS node_id,
    1 - (n.embedding_index <=> query_embedding_index) AS similarity
  FROM nodes n
  WHERE 
    n.embedding_index IS NOT NULL
    AND n.type = entity_type
    AND (tenant_id_param IS NULL OR n.tenant_id = tenant_id_param)
    AND (exclude_ids IS NULL OR n.id != ALL(exclude_ids))
    AND (1 - (n.embedding_index <=> query_embedding_index)) >= similarity_threshold
  ORDER BY n.embedding_index <=> query_embedding_index
  LIMIT result_limit;
END;
$$;

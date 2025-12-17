-- To apply: psql $DATABASE_URL -f src/db/migrations/add_composite_index.sql
-- Or apply via Supabase dashboard SQL editor

CREATE INDEX IF NOT EXISTS idx_nodes_canonical_type ON nodes(canonical_name, type);

-- Verify the index was created:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'nodes' AND indexname = 'idx_nodes_canonical_type';

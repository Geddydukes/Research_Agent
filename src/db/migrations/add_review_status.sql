-- Add review_status and review_reasons columns to nodes and edges tables
-- These fields control which data appears in /graph (approved) vs /graphreview (flagged/rejected)

-- Add columns to nodes table
ALTER TABLE nodes 
  ADD COLUMN IF NOT EXISTS review_status TEXT CHECK (review_status IN ('approved', 'flagged', 'rejected')),
  ADD COLUMN IF NOT EXISTS review_reasons TEXT;

-- Add columns to edges table  
ALTER TABLE edges
  ADD COLUMN IF NOT EXISTS review_status TEXT CHECK (review_status IN ('approved', 'flagged', 'rejected')),
  ADD COLUMN IF NOT EXISTS review_reasons TEXT;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_nodes_review_status ON nodes(review_status);
CREATE INDEX IF NOT EXISTS idx_edges_review_status ON edges(review_status);

-- Set default review_status for existing rows (backward compatibility)
-- Existing data without review_status should be treated as 'approved' for now
UPDATE nodes SET review_status = 'approved' WHERE review_status IS NULL;
UPDATE edges SET review_status = 'approved' WHERE review_status IS NULL;

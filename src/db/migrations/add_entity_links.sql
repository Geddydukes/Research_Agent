-- Entity links table for canonicalization (non-destructive)
-- Only 'alias_of' links affect canonicalization in views
-- 'same_as_candidate' is for proposals only
CREATE TABLE IF NOT EXISTS entity_links (
  id SERIAL PRIMARY KEY,
  node_id INT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  canonical_node_id INT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('alias_of', 'same_as_candidate')),
  confidence FLOAT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected')),
  evidence TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by TEXT,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(node_id, canonical_node_id, tenant_id)
);

-- Enforce at most one approved alias_of per node per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_links_unique_approved_alias
ON entity_links(node_id, tenant_id)
WHERE status = 'approved' AND link_type = 'alias_of';

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_entity_links_node ON entity_links(node_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_canonical ON entity_links(canonical_node_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_status ON entity_links(status);
CREATE INDEX IF NOT EXISTS idx_entity_links_tenant ON entity_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_type_status ON entity_links(link_type, status);

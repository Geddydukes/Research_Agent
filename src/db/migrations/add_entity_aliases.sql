-- Entity aliases table for storing name variants
CREATE TABLE IF NOT EXISTS entity_aliases (
  id SERIAL PRIMARY KEY,
  node_id INT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  source_paper_id TEXT,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(node_id, alias_name, tenant_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_entity_aliases_node ON entity_aliases(node_id);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_tenant ON entity_aliases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_name ON entity_aliases(alias_name);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_node_tenant ON entity_aliases(node_id, tenant_id);

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'viewer')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  default_model_choices JSONB DEFAULT '{}'::jsonb,
  max_papers_per_run INTEGER,
  max_reasoning_depth INTEGER DEFAULT 2,
  semantic_gating_threshold FLOAT DEFAULT 0.7,
  allow_speculative_edges BOOLEAN DEFAULT false,
  enabled_relationship_types TEXT[] DEFAULT ARRAY[]::TEXT[],
  execution_mode TEXT NOT NULL DEFAULT 'hosted' CHECK (execution_mode IN ('hosted', 'byo_key')),
  api_key_encrypted TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO tenants (id, name, slug, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'Default Tenant', 'default', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant_settings (tenant_id, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', NOW(), NOW())
ON CONFLICT (tenant_id) DO NOTHING;

ALTER TABLE papers
ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;

ALTER TABLE papers
ADD CONSTRAINT fk_papers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE paper_sections
ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;

ALTER TABLE paper_sections
ADD CONSTRAINT fk_paper_sections_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE nodes
ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;

ALTER TABLE nodes
ADD CONSTRAINT fk_nodes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE edges
ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;

ALTER TABLE edges
ADD CONSTRAINT fk_edges_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE entity_mentions
ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;

ALTER TABLE entity_mentions
ADD CONSTRAINT fk_entity_mentions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE inferred_insights
ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;

ALTER TABLE inferred_insights
ADD CONSTRAINT fk_inferred_insights_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_papers_tenant_id ON papers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_paper_sections_tenant_id ON paper_sections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nodes_tenant_id ON nodes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_edges_tenant_id ON edges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_tenant_id ON entity_mentions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inferred_insights_tenant_id ON inferred_insights(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);

CREATE INDEX IF NOT EXISTS idx_papers_tenant_created ON papers(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_tenant_type ON nodes(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_edges_tenant_review ON edges(tenant_id, review_status);

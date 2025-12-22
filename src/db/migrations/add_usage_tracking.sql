CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID,
  pipeline_stage TEXT NOT NULL,
  agent_name TEXT,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost_usd DECIMAL(10, 6) NOT NULL,
  execution_mode TEXT CHECK (execution_mode IN ('hosted', 'byo_key')),
  timestamp TIMESTAMP DEFAULT NOW(),
  job_id UUID,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_timestamp ON usage_events(tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_stage ON usage_events(tenant_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_model ON usage_events(tenant_id, model);
CREATE INDEX IF NOT EXISTS idx_usage_events_job_id ON usage_events(job_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_date ON usage_events(tenant_id, DATE(timestamp));

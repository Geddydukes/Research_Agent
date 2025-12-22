ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS monthly_cost_limit DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS monthly_token_limit INTEGER,
  ADD COLUMN IF NOT EXISTS daily_cost_limit DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS daily_token_limit INTEGER;

COMMENT ON COLUMN tenant_settings.monthly_cost_limit IS 'Monthly cost limit in USD (soft limit - warnings only)';
COMMENT ON COLUMN tenant_settings.monthly_token_limit IS 'Monthly token limit (soft limit - warnings only)';
COMMENT ON COLUMN tenant_settings.daily_cost_limit IS 'Daily cost limit in USD (soft limit - warnings only)';
COMMENT ON COLUMN tenant_settings.daily_token_limit IS 'Daily token limit (soft limit - warnings only)';


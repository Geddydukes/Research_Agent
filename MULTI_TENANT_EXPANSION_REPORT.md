# Multi-Tenant OSS Expansion - Implementation Report

**Date:** December 21, 2024  
**Branch:** `feature/multi-tenant-oss-expansion`  
**Status:** ✅ Complete

## Executive Summary

Successfully transformed the Research Agent Knowledge Graph from a single-tenant system into a fully multi-tenant, open-source platform with usage tracking, billing primitives, and a clear OSS/hosted boundary. All migrations have been applied to the database, and comprehensive tests have been created and executed.

## Phase 1: Multi-Tenancy Foundation ✅

### 1.1 Database Schema (✅ Complete)

**Migration:** `add_tenancy.sql`

- **New Tables Created:**
  - `tenants` - Tenant identity table with UUID primary key, name, and slug
  - `tenant_users` - User-tenant membership with roles (owner, member, viewer)
  - `tenant_settings` - Per-tenant configuration (model choices, limits, execution mode, API keys)

- **Schema Modifications:**
  - Added `tenant_id` column to all existing tables:
    - `papers`
    - `paper_sections`
    - `nodes`
    - `edges`
    - `entity_mentions`
    - `inferred_insights`
  
- **Foreign Keys & Constraints:**
  - All `tenant_id` columns reference `tenants(id)` with `ON DELETE CASCADE`
  - `tenant_users` has unique constraint on `(tenant_id, user_id)`
  - `tenant_settings.execution_mode` has CHECK constraint for 'hosted' | 'byo_key'

- **Indexes Created:**
  - Individual indexes on all `tenant_id` columns
  - Composite indexes for common query patterns:
    - `idx_papers_tenant_created` (tenant_id, created_at)
    - `idx_nodes_tenant_type` (tenant_id, type)
    - `idx_edges_tenant_review` (tenant_id, review_status)

- **Default Tenant:**
  - Created default tenant with UUID `00000000-0000-0000-0000-000000000000`
  - All existing data backfilled with default tenant ID
  - Maintains backward compatibility for single-tenant usage

**Status:** ✅ Migration applied successfully via Supabase MCP

### 1.2 DatabaseClient Updates (✅ Complete)

**File:** `src/db/client.ts`

- Modified constructor to require `tenantId` parameter
- All query methods automatically filter by `tenant_id`:
  - `getPapers()`, `getNodes()`, `getEdges()`, etc.
- All insert methods automatically include `tenant_id`
- New methods added:
  - `getTenantSettings()` - Retrieve tenant configuration
  - `updateTenantSettings()` - Update tenant configuration
  - `getTenantMembers()` - Get tenant users
  - `insertTenant()` - Create new tenant
  - `insertTenantUser()` - Add user to tenant

**Type Safety:**
- All interfaces updated to include `tenant_id: string`
- New interfaces: `Tenant`, `TenantUser`, `TenantSettings`

### 1.3 Authentication Middleware (✅ Complete)

**File:** `src/api/middleware/tenantAuth.ts`

- Created `requireTenant()` middleware that:
  1. Extracts user from Supabase Auth JWT (optional in dev)
  2. Resolves tenant ID from:
     - `x-tenant-id` header (priority 1)
     - URL path parameter `/api/tenant/:slug/...` (priority 2)
     - User's default tenant (priority 3)
     - Default tenant fallback (priority 4)
  3. Verifies user access to tenant
  4. Attaches `tenantId` and `userId` to request object

- Created `optionalTenant()` middleware for routes that work with or without tenant context

### 1.4 Pipeline Updates (✅ Complete)

**Files:** `src/pipeline/runPipeline.ts`, `src/pipeline/runReasoningBatch.ts`

- Pipeline now accepts `tenantId` as required parameter
- Loads tenant settings at start of pipeline execution
- Passes tenant-specific configuration to all agents:
  - Model choices
  - Execution mode (hosted vs. BYO key)
  - Semantic thresholds
  - Reasoning depth limits

### 1.5 Cache Isolation (✅ Complete)

**Files:** `src/utils/cache.ts`, `src/cache/derived.ts`

- Cache keys now include `tenantId`
- Cache file paths are tenant-scoped:
  - `cache/{tenantId}/...` for agent caches
  - `cache/{tenantId}/derived/...` for derived caches
- Prevents cross-tenant cache hits

### 1.6 API Routes (✅ Complete)

**Files:** `src/api/routes/*.ts`

All routes updated to:
- Use `requireTenant` middleware
- Create tenant-scoped `DatabaseClient` instances using `request.tenantId`
- Automatically filter all queries by tenant

**Routes Updated:**
- Papers, Graph, Nodes, Edges, Insights, Stats, Search, Pipeline

### 1.7 Migration Script (✅ Complete)

**File:** `scripts/migrate_to_tenants.ts`

- Created verification script to check schema changes
- Note: Actual SQL migrations applied via Supabase MCP (see Phase 2)

## Phase 2: Usage Tracking & Billing Primitives ✅

### 2.1 Usage Events Table (✅ Complete)

**Migration:** `add_usage_tracking.sql`

- Created `usage_events` table with:
  - Token tracking (input_tokens, output_tokens)
  - Cost estimation (estimated_cost_usd)
  - Execution mode (hosted/byo_key)
  - Pipeline stage and agent name
  - Job ID and metadata (JSONB)

- **Indexes Created:**
  - `idx_usage_events_tenant_timestamp` - For time-range queries
  - `idx_usage_events_tenant_stage` - For stage-level aggregation
  - `idx_usage_events_tenant_model` - For model-level analysis
  - `idx_usage_events_tenant_date` - Composite for daily queries

**Status:** ✅ Migration applied successfully

### 2.2 Usage Tracking Service (✅ Complete)

**File:** `src/services/usageTracking.ts`

- Created `UsageTrackingService` class with:
  - `logUsageEvent()` - Log individual usage events
  - `logLLMUsage()` - Calculate cost and log LLM calls
  - `getUsageStats()` - Aggregate statistics by period
  - `getUsageEvents()` - Paginated event retrieval

- **Features:**
  - Automatic cost calculation using pricing constants
  - Markup support for hosted mode
  - Statistics aggregation by stage, model, and time period

### 2.3 Pricing Service (✅ Complete)

**File:** `src/services/pricing.ts`

- Model pricing constants for:
  - Gemini models (Flash, Pro, Embedding)
  - OpenAI models (placeholder for future support)
- Cost calculation with markup support
- Pricing updates can be made by updating constants

### 2.4 LLM Instrumentation (✅ Complete)

**File:** `src/agents/runAgent.ts`

- Instrumented all LLM calls to:
  - Extract token usage from Gemini API responses
  - Calculate costs based on model and execution mode
  - Log usage events (non-blocking, errors don't fail requests)
  - Track pipeline stage, agent name, and metadata

**Integration Points:**
- All `runAgent()` calls in pipeline now log usage
- Reasoning batch jobs log usage
- Usage tracking respects execution mode (hosted vs. BYO)

### 2.5 Encryption Service (✅ Complete)

**File:** `src/services/encryption.ts`

- AES-256-GCM encryption with scrypt key derivation
- Functions:
  - `encrypt()` - Encrypt API keys for storage
  - `decrypt()` - Decrypt API keys for use
  - `isEncrypted()` - Heuristic check for encrypted values

- **Security:**
  - Salt + IV + Auth Tag pattern
  - Key derived from `ENCRYPTION_KEY` env variable
  - Used for storing BYO API keys in `tenant_settings.api_key_encrypted`

### 2.6 BYO Key Support (✅ Complete)

**Integration:**
- Pipeline loads encrypted API key from tenant settings in BYO mode
- Decrypts key before use
- Passes decrypted key to `runAgent()` via `apiKeyOverride`
- `runAgent()` uses tenant key in BYO mode, platform key in hosted mode

### 2.7 Usage Limits Service (✅ Complete)

**Migration:** `add_usage_limits.sql`

- Added limit fields to `tenant_settings`:
  - `monthly_cost_limit`
  - `monthly_token_limit`
  - `daily_cost_limit`
  - `daily_token_limit`

**File:** `src/services/usageLimits.ts`

- Created `UsageLimitsService` with:
  - `checkLimits()` - Check usage against limits, return warnings/errors
  - `isWithinLimits()` - Boolean check
  - `getUsageSummary()` - Comprehensive usage and limit status

- **Soft Limits:**
  - Warnings at 80% threshold
  - Errors at 100% threshold
  - Does not block execution (soft limits)

### 2.8 Usage API Endpoints (✅ Complete)

**File:** `src/api/routes/usage.ts`

**Endpoints Created:**
- `GET /api/usage/stats` - Get usage statistics with optional date range
- `GET /api/usage/events` - Get usage events with pagination and filtering
- `GET /api/usage/limits` - Check usage against limits
- `GET /api/usage/summary` - Comprehensive usage summary with limit status

All endpoints:
- Require tenant authentication
- Are tenant-scoped
- Support filtering by date range, pipeline stage, etc.

## Phase 3: OSS Boundary Definition ✅

### 3.1 License & Documentation (✅ Complete)

**Files Created:**
- `LICENSE` - MIT License
- `docs/OSS_BOUNDARY.md` - Comprehensive OSS vs. hosted feature breakdown
- Updated `README.md` with license and OSS boundary information

**OSS Components:**
- Complete pipeline (ingestion, extraction, validation, reasoning)
- All agent prompts and schemas
- Database schema and migrations
- Core API endpoints
- CLI tools
- Cache and utility systems

**Hosted Features:**
- Multi-tenant orchestration UI
- Hosted job queue
- Usage dashboards
- Managed ingestion
- Advanced analytics
- Enterprise features

### 3.2 Hosted Directory Structure (✅ Complete)

**Directory:** `hosted/`

Created structure for hosted-specific code:
- `hosted/services/` - Multi-tenant services
- `hosted/ui/` - Admin and user dashboards
- `hosted/jobs/` - Background job queue workers
- `hosted/billing/` - Billing integration

- Added `hosted/README.md` explaining hosted code organization
- Code in `hosted/` is proprietary (not MIT-licensed)

### 3.3 Feature Flags (✅ Complete)

**File:** `src/config/featureFlags.ts`

Created feature flag system:
- `ENABLE_MULTI_TENANT` - Multi-tenancy features
- `ENABLE_USAGE_TRACKING` - Usage tracking (default: enabled)
- `ENABLE_HOSTED_QUEUE` - Hosted job queue
- `ENABLE_BILLING` - Billing features

**Functions:**
- `getFeatureFlags()` - Get all flags from environment
- `isFeatureEnabled()` - Check if feature is enabled
- `requireFeature()` - Throw if feature disabled

## Testing ✅

### Test Files Created

1. **`tests/multi-tenant.test.ts`**
   - DatabaseClient tenant isolation
   - Tenant settings retrieval and updates
   - Multi-tenant functionality

2. **`tests/usage-tracking.test.ts`**
   - Cost calculation
   - Usage event logging
   - Usage statistics aggregation
   - Hosted vs. BYO key mode tracking

### Test Results

**Migration Application:**
- ✅ `add_tenancy` - Applied successfully
- ✅ `add_usage_tracking` - Applied successfully
- ✅ `add_usage_limits` - Applied successfully

**Test Execution:**
- ✅ Usage Tracking Tests: 22/22 passed
- ✅ Multi-Tenant Tests: 6/6 passed
- **Total: 28/28 tests passing (100%)**
- **Test Suites: 2/2 passed**

All tests verified and passing successfully!

## Database Migrations Applied

### Applied Migrations (via Supabase MCP)

1. **`add_tenancy`** (Version: 20251221181928)
   - Creates tenants, tenant_users, tenant_settings tables
   - Adds tenant_id to all existing tables
   - Creates indexes and foreign keys
   - Creates default tenant

2. **`add_usage_tracking`** (Version: 20251221181934)
   - Creates usage_events table
   - Creates indexes for usage queries

3. **`add_usage_limits`** (Version: 20251221181938)
   - Adds limit columns to tenant_settings
   - Adds column comments

**Verification:**
- ✅ All migrations applied successfully via Supabase MCP
- ✅ All tables created with correct schema:
  - `tenants` (1 row - default tenant)
  - `tenant_users` (0 rows - ready for use)
  - `tenant_settings` (1 row - default tenant settings)
  - `usage_events` (20 rows - test data from usage tracking tests)
  - All existing tables have `tenant_id` column with foreign keys
- ✅ All indexes created correctly
- ✅ All foreign key constraints in place
- ✅ Default tenant exists with UUID `00000000-0000-0000-0000-000000000000`

## Files Created/Modified

### New Files (27 files)

**Services:**
- `src/services/pricing.ts`
- `src/services/usageTracking.ts`
- `src/services/usageLimits.ts`
- `src/services/encryption.ts`

**Migrations:**
- `src/db/migrations/add_tenancy.sql`
- `src/db/migrations/add_usage_tracking.sql`
- `src/db/migrations/add_usage_limits.sql`

**Middleware:**
- `src/api/middleware/tenantAuth.ts`

**Routes:**
- `src/api/routes/usage.ts`

**Config:**
- `src/config/featureFlags.ts`

**Tests:**
- `tests/multi-tenant.test.ts`
- `tests/usage-tracking.test.ts`

**Documentation:**
- `LICENSE`
- `docs/OSS_BOUNDARY.md`

**Hosted Structure:**
- `hosted/README.md`
- `hosted/.gitkeep`
- `hosted/services/` (directory)
- `hosted/ui/` (directory)
- `hosted/jobs/` (directory)
- `hosted/billing/` (directory)

### Modified Files (15+ files)

**Core:**
- `src/db/client.ts` - Multi-tenant support
- `src/pipeline/runPipeline.ts` - Tenant context
- `src/pipeline/runReasoningBatch.ts` - Tenant context
- `src/agents/runAgent.ts` - Usage tracking
- `src/utils/cache.ts` - Tenant isolation
- `src/cache/derived.ts` - Tenant isolation
- `src/index.ts` - Default tenant for CLI

**API:**
- `src/api/server.ts` - Usage routes registration
- `src/api/routes/pipeline.ts` - Tenant middleware
- `src/api/routes/*.ts` - All routes updated for tenant context
- `src/api/controllers/pipelineController.ts` - Tenant context
- `src/api/routes/index.ts` - Export usage routes

**Ingestion:**
- `src/ingest/unified/selection.ts` - Tenant context
- `src/embeddings/embed.ts` - Tenant context
- `scripts/fetch_and_ingest.ts` - Default tenant

**Tests:**
- `tests/embed.test.ts` - Tenant context
- `tests/entityDedupe.test.ts` - Tenant context
- `src/api/tests/utils/*.ts` - Test helpers updated

**Documentation:**
- `README.md` - License and OSS boundary info

## Key Features Implemented

### ✅ Multi-Tenancy
- Complete tenant isolation at database, API, and cache layers
- Tenant-scoped queries (automatic filtering)
- Tenant settings per tenant
- User-tenant membership with roles

### ✅ Usage Tracking
- Automatic token usage tracking from LLM calls
- Cost calculation with markup support
- Per-tenant usage statistics
- Usage events with metadata

### ✅ BYO Key Support
- Encrypted API key storage
- Automatic decryption and use
- Execution mode switching (hosted/byo_key)

### ✅ Usage Limits
- Soft limits (warnings, not blocking)
- Monthly and daily limits (cost and tokens)
- Limit checking and reporting

### ✅ OSS Boundary
- Clear separation of OSS and hosted code
- MIT license for core functionality
- Feature flags for conditional features

## Architecture Decisions

1. **Default Tenant Pattern**: Uses fixed UUID for backward compatibility, allowing existing single-tenant deployments to work without changes.

2. **Soft Limits**: Usage limits are warnings, not hard blocks, allowing graceful degradation rather than sudden failures.

3. **Non-Blocking Usage Tracking**: Usage logging failures don't break requests, ensuring reliability.

4. **Tenant Isolation**: Every layer (database, cache, API) enforces tenant boundaries to prevent data leakage.

5. **Backward Compatibility**: Single-tenant usage continues to work via default tenant, ensuring existing deployments aren't broken.

## Performance Considerations

- **Indexes**: Created composite indexes for common tenant-scoped queries
- **Cache Isolation**: Tenant-specific cache paths prevent cache pollution
- **Query Filtering**: All queries automatically filtered by tenant_id at database layer

## Security Considerations

- **API Key Encryption**: BYO keys encrypted at rest using AES-256-GCM
- **Tenant Isolation**: Database-level foreign keys ensure data isolation
- **Access Control**: Middleware verifies user access to tenants
- **Encryption Key**: Should use proper key management (KMS/Vault) in production

## Next Steps (Future Phases)

### Phase 4: UX and Onboarding (Not Implemented)
- Tenant management UI
- User onboarding flows
- Usage dashboards
- Graph visualization enhancements

### Operational Hardening (Not Implemented)
- Background job retries
- Dead letter queues
- Snapshot versioning
- Prompt versioning
- Model fallback strategies

## Conclusion

The multi-tenant OSS expansion has been successfully implemented with:
- ✅ Complete multi-tenancy with full isolation
- ✅ Usage tracking and billing primitives
- ✅ BYO key support with encryption
- ✅ Clear OSS/hosted boundary
- ✅ Comprehensive tests
- ✅ Database migrations applied

The system is ready for:
1. Single-tenant deployments (OSS, MIT-licensed)
2. Multi-tenant hosted deployments (with hosted services)
3. Hybrid deployments (OSS core + hosted services)

All core functionality is open-source under MIT license, with hosted services clearly separated in the `hosted/` directory.


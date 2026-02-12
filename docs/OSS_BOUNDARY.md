# Open Source vs. Hosted Features

This document defines the boundary between open-source (OSS) and hosted/paid features in the Research Agent Knowledge Graph system.

## Open Source (MIT Licensed)

The following components are available under the MIT license and can be used freely:

### Core Pipeline
- **Paper ingestion and parsing** (`src/ingest/`, `src/utils/paperParser.ts`)
  - PDF parsing with fallback OCR
  - Section extraction
  - Text normalization
- **Agent execution** (`src/agents/`)
  - Entity extraction agents
  - Relationship extraction agents
  - Reasoning agents
  - All agent prompts and schemas
- **Validation rules** (`src/agents/validationRules.ts`)
  - Entity validation logic
  - Edge validation logic
  - Confidence adjustment rules
- **Graph construction** (`src/pipeline/`, `src/reasoning/`)
  - Node and edge insertion
  - Entity deduplication
  - Graph snapshot generation
  - Reasoning subgraph construction

### Database Schema
- All database schema definitions (`src/db/migrations/`)
- Core tables: `papers`, `paper_sections`, `nodes`, `edges`, `entity_mentions`, `inferred_insights`
- Multi-tenant schema (tenants, tenant_users, tenant_settings)

### API Endpoints (Core Functionality)
- Paper CRUD operations
- Graph query endpoints (nodes, edges, search)
- Insights retrieval
- Pipeline processing (single-tenant execution)

### Utilities
- Cache system (`src/utils/cache.ts`, `src/cache/derived.ts`)
- Embedding utilities (`src/embeddings/`)
- Canonicalization (`src/utils/canonicalize.ts`)
- Retry and rate limiting utilities

### CLI Tools
- Single-paper processing (`src/index.ts`)
- Corpus selection and ingestion scripts
- Local execution tools

## Hosted/Paid Features

The following features are available only in the hosted service:

### Multi-Tenant Orchestration
- Multi-tenant request routing and isolation
- Tenant user management UI
- Cross-tenant analytics and administration

### Hosted Job Queue
- Distributed job processing
- Background job retries
- Dead letter queue management
- Job status tracking and monitoring

### Usage Dashboards
- Real-time usage analytics
- Cost tracking and reporting
- Usage limit management UI
- Billing integration

### Managed Ingestion
- Scheduled paper ingestion
- Automatic corpus updates
- Managed API key rotation
- Ingestion pipeline monitoring

### Advanced Features
- Trend analysis across multiple papers
- Team collaboration features
- Shared graph views
- Advanced graph visualization
- Export and reporting tools

### Enterprise Features
- SSO/SAML integration
- Custom domain support
- Priority support
- SLA guarantees
- Custom model fine-tuning

## Implementation Location

### Open Source Code
All OSS code lives in the root directory structure:
- `src/` - Core application code
- `scripts/` - CLI and utility scripts
- `docs/` - Documentation
- `tests/` - Test files

### Hosted Service Code
Hosted-specific code is organized in:
- `hosted/` - Hosted service implementations
  - `hosted/services/` - Multi-tenant services
  - `hosted/ui/` - Admin and user dashboards
  - `hosted/jobs/` - Job queue workers
  - `hosted/billing/` - Billing integration

## Feature Flags

The system uses feature flags to enable/disable hosted features:
- `ENABLE_MULTI_TENANT` - Enable multi-tenant features
- `ENABLE_USAGE_TRACKING` - Enable usage tracking (required for hosted)
- `ENABLE_HOSTED_QUEUE` - Enable hosted job queue
- `ENABLE_BILLING` - Enable billing features

See `src/config/featureFlags.ts` for implementation.

## Development

### Running in OSS Mode
When running locally or in single-tenant mode:
1. Set `ENABLE_MULTI_TENANT=false` (or omit)
2. Use default tenant ID for all operations
3. Usage tracking is optional (can be disabled)
4. All core features work without hosted services

### Running in Hosted Mode
When deploying the hosted service:
1. Set required environment variables for multi-tenancy
2. Deploy hosted services from `hosted/` directory
3. Configure job queue and background workers
4. Set up billing integration
5. Enable usage tracking and limits

## Contributing

We welcome contributions to the open-source components! Please ensure:
- All changes maintain backward compatibility
- New features follow the OSS/hosted boundary
- Documentation is updated accordingly
- Tests pass for both OSS and hosted modes

## Questions?

If you have questions about the OSS boundary or want to propose changes, please open an issue or discussion on GitHub.



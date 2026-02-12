# Research Agent API

RESTful API server for the Research Agent Knowledge Graph system, built with Fastify.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (see `env.example`):
```bash
cp env.example .env
# Edit .env with your configuration
```

3. Start the API server:
```bash
npm run api
# or for development with hot reload:
npm run api:dev
```

The API will be available at `http://localhost:3000` (or the port specified in `API_PORT`).

## API Endpoints

### Papers

- `GET /api/papers` - List all papers (with pagination)
  - Query params: `page`, `limit`
- `GET /api/papers/:paperId` - Get paper details
- `GET /api/papers/:paperId/sections` - Get paper sections
- `GET /api/papers/:paperId/nodes` - Get entities extracted from paper
- `GET /api/papers/:paperId/edges` - Get relationships from paper

### Graph (Windowed for UI)

- `GET /api/graph/neighborhood` - Get graph neighborhood (primary UI endpoint)
  - Query params: `nodeId` or `paperId`, `depth` (1–20, steps from paper/node), `maxNodes`, `maxEdges`
  - Example: `/api/graph/neighborhood?paperId=123&depth=5&maxNodes=500`
- `GET /api/graph/viewport` - Get graph viewport centered on a paper
  - Query params: `paperId`, `depth` (1–20), `maxNodes`
- `POST /api/graph/subgraph` - Get subgraph for selected papers
  - Body: `{ "paperIds": ["id1", "id2"] }`
- `GET /api/graph` - Get full graph (debug only, hard cap at 5000 nodes)

### Edges

- `GET /api/edges` - List all edges (with pagination)
  - Query params: `page`, `limit`
- `GET /api/edges/:edgeId` - Get edge modal data (first-class contract)
  - Returns: edge, source/target nodes, source/target papers, validation status, insight IDs
- `GET /api/edges/:edgeId/insights` - Get insights for an edge

### Search

- `GET /api/search` - Search papers and nodes
  - Query params: `q` (required), `type` (optional: "paper" | "node"), `limit`
- `GET /api/search/semantic` - Semantic search (embeddings)
  - Query params: `q`, `limit`, `threshold`
- `GET /api/arxiv` - Search arXiv (public API; no key required)
  - Query params: `q` (required), `limit` (optional, 1–40, default 20)
  - Returns: `{ data: ArxivPaper[] }` (paperId, title, abstract, year). Use with pipeline process-url (e.g. `https://arxiv.org/abs/{paperId}`).

### Insights

- `GET /api/insights` - List all insights (with pagination)
  - Query params: `page`, `limit`
- `GET /api/insights/:insightId` - Get insight details

### Statistics

- `GET /api/stats` - Get overall statistics
- `GET /api/stats/papers/:paperId` - Get statistics for a specific paper

### Pipeline

- `POST /api/pipeline/process` - Process a paper through the pipeline (requires Supabase auth)
  - Headers: `Authorization: Bearer <supabase access token>`
  - Body: `{ "paper_id": "...", "title": "...", "raw_text": "...", "metadata": {...}, "reasoning_depth": 2 }`
- `POST /api/pipeline/process-file` - Process a PDF/DOCX/JSON file (base64)
  - Body: `{ "file_name": "paper.pdf", "file_base64": "...", "reasoning_depth": 2 }`
- `POST /api/pipeline/process-url` - Process a remote URL (pdf/json/text)
  - Body: `{ "url": "https://...", "paper_id": "optional-id", "reasoning_depth": 2 }`
- `GET /api/pipeline/status/:jobId` - Check processing status
- `GET /api/pipeline/jobs` - List pipeline jobs (pagination, optional `status`)

### Settings

- `GET /api/settings` - Get tenant settings (requires auth)
- `PUT /api/settings` - Update tenant settings (requires auth)
- `POST /api/settings/validate-key` - Validate a BYO API key (requires auth)

### Tenants

- `POST /api/tenants/ensure` - Ensure a tenant exists for the authenticated user
- `GET /api/tenants` - List tenant memberships for the authenticated user

### Review

- `POST /api/review/nodes` - Bulk update node review status
- `POST /api/review/edges` - Bulk update edge review status

## Authentication

All authenticated endpoints require a Supabase access token:

```
Authorization: Bearer <supabase access token>
```

The backend verifies the token against Supabase and resolves the tenant from:
1. `x-tenant-id` header (explicit selection)
2. `/api/tenant/:slug` (when using slug routes)
3. User's first tenant membership
4. Default tenant fallback (dev)

## Architecture

The API follows a clean architecture pattern:

```
src/api/
??? server.ts          # Fastify app setup
??? routes/            # Route registration
??? controllers/       # Request handling
??? services/          # Business logic
??? middleware/        # Error handling, auth
??? types/            # TypeScript types
```

### Key Design Decisions

1. **Windowed Graph Endpoints**: The graph endpoints use neighborhood/viewport patterns instead of returning the full graph, preventing performance issues as the knowledge graph grows.

2. **Edge Modal as First-Class**: `GET /api/edges/:edgeId` returns everything needed for the edge modal in a single request, providing a stable contract for the UI.

3. **Decoupled Processing**: Pipeline processing is asynchronous and doesn't block query endpoints. Jobs are persisted in the `pipeline_jobs` table for polling and history.

4. **Type Safety**: Full TypeScript support with proper types for requests and responses.

## Environment Variables

- `API_PORT` - Server port (default: 3000)
- `API_HOST` - Server host (default: 0.0.0.0)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `SUPABASE_ANON_KEY` - Supabase anon key (token verification)
- `ENCRYPTION_KEY` - Key for BYOK encryption (required in production)
- `CORS_ORIGIN` - Allowed CORS origin (default: *)
- `LOG_LEVEL` - Logging level (default: info)
- `NODE_ENV` - Environment (development/production)

Plus all the existing database and API keys from the main application.

## Response Format

All successful responses follow this format:

```json
{
  "data": { ... }
}
```

Paginated responses:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

Error responses:

```json
{
  "error": {
    "message": "Error message",
    "code": "ERROR_CODE",
    "statusCode": 400
  }
}
```

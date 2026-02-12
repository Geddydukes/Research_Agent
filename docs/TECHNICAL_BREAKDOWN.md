# Technical Breakdown: AI Research Discovery Agent

This document provides a comprehensive technical breakdown of the application for review. It covers the problem domain, architecture, data models, pipeline, validation, multi-tenancy, API, and frontend—with enough detail to verify technical correctness and design rationale.

---

## 1. Problem Statement and Design Thesis

### The Problem

Academic papers encode rich semantic claims (e.g., "Method A improves on Method B") that are not structured for discovery or reasoning. Researchers face:

- **Information overload**: In domains like neural rendering, 50+ papers per month; manual reading does not scale.
- **Implicit structure**: Claims are buried in prose; citation graphs show *that* papers connect but not *why*.
- **Low-trust automation**: Vector search and "chat with PDF" tools hallucinate relationships and provide no audit trail.

A system that only retrieves or summarizes is insufficient. Output must be **structured, auditable, and trustworthy at scale**.

### Core Design Principle

**Use LLMs for probabilistic extraction; never for authority.**

- **Probabilistic extraction**: Stateless LLM agents (Gemini) propose entities and relationships from paper text.
- **Deterministic enforcement**: All agent output is treated as untrusted. Code-based validation enforces confidence thresholds, canonicalization, structural invariants, and provenance before any graph mutation.

This separation preserves correctness, explainability, and maintainability as the corpus grows.

---

## 2. High-Level Architecture

### Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js, TypeScript |
| API | Fastify (REST) |
| Database | PostgreSQL (Supabase), pgvector |
| LLMs | Google Gemini (e.g. 2.5 Pro / Flash) |
| Embeddings | gemini-embedding-001 (3072 dims) |
| Auth | Supabase Auth (JWT), optional API key |

### Data Flow (Simplified)

1. **Corpus selection** (optional): Multi-source retrieval → semantic gating (cosine similarity ≥ threshold) → top-K papers.
2. **Per-paper pipeline**: Ingest (sections) → entity extraction → relationship extraction → **deterministic validation** → persist entities (with optional semantic dedup) → persist edges → evidence enrichment (LLM) → optional reasoning (subgraph → insights).
3. **Query**: Graph/neighborhood, search (full-text + semantic), insights, papers—all tenant-scoped.

Every relationship in the graph is traceable to verbatim evidence and provenance; entity canonicalization is link-based and reversible.

---

## 3. Data Layer

### 3.1 Core Schema

- **papers**: `paper_id` (PK), `tenant_id`, `title`, `abstract`, `year`, `metadata`, `embedding` (vector(3072)), `created_at`.
- **paper_sections**: `id`, `paper_id`, `tenant_id`, `section_type`, `content`, `word_count`, `part_index`.
- **nodes**: `id`, `tenant_id`, `type`, `canonical_name`, `metadata`, `original_confidence`, `adjusted_confidence`, `review_status`, `review_reasons`, `embedding_raw` (vector(3072)), `embedding_index` (vector(768)), `created_at`.
- **edges**: `id`, `tenant_id`, `source_node_id`, `target_node_id`, `relationship_type`, `confidence`, `evidence` (max 300 chars), `provenance` (JSONB), `review_status`, `review_reasons`, `created_at`.
- **entity_mentions**: `node_id`, `paper_id`, `tenant_id`, `section_type`, `mention_count`.
- **inferred_insights**: `tenant_id`, `insight_type`, `subject_nodes` (int[]), `reasoning_path` (JSONB), `confidence`.

All graph tables carry `tenant_id`; FKs and indexes support tenant-scoped queries.

### 3.2 Entity Canonicalization (Link-Based)

- **entity_links**: `node_id`, `canonical_node_id`, `link_type` ('alias_of' | 'same_as_candidate'), `confidence`, `status` ('proposed' | 'approved' | 'rejected'), `tenant_id`. Only `alias_of` + `approved` affect resolution.
- **entity_aliases**: `node_id`, `alias_name`, `source_paper_id`, `tenant_id`—name variants per node.
- **nodes_resolved** (view): For each node, `canonical_node_id` = approved `alias_of` target if any, else `id`. Implemented as correlated subquery; an optimized JOIN form is documented for scale.
- **edges_resolved** (view): Same as `edges` plus `canonical_source_node_id` and `canonical_target_node_id` from `nodes_resolved`.

Canonicalization is non-destructive: links can be audited and reversed; no merge deletes.

### 3.3 Multi-Tenancy

- **tenants**: `id` (UUID), `name`, `slug`.
- **tenant_users**: `tenant_id`, `user_id` (Supabase auth UUID), `role` ('owner' | 'member' | 'viewer').
- **tenant_settings**: Per-tenant pipeline/reasoning config: `max_papers_per_run`, `max_reasoning_depth`, `semantic_gating_threshold`, `allow_speculative_edges`, `enabled_relationship_types`, `execution_mode` ('hosted' | 'byo_key'), `api_key_encrypted`, optional cost/token limits.

Default tenant ID `00000000-0000-0000-0000-000000000000` allows single-tenant/OSS usage without Supabase auth.

### 3.4 Vector Search (pgvector)

- **papers.embedding**: 3072-d (gemini-embedding-001). No index (pgvector index limit 2000); sequential scan for similarity. Used for semantic gating and similar-paper search.
- **nodes**: Dual storage—`embedding_raw` (3072-d) for precision; `embedding_index` (768-d) with HNSW for fast candidate search. Entity resolution uses index for candidates, then optional rerank with raw.
- **find_similar_papers** (SQL): Takes `query_embedding`, `similarity_threshold`, `result_limit`, `exclude_ids`, `tenant_id_param`; returns `(paper_id, similarity)` using cosine distance.
- **find_similar_nodes**: Analogous for entities; tenant-scoped.

Embeddings are persisted so semantic gating and entity resolution reuse them, cutting API calls for already-processed papers.

---

## 4. Pipeline (runPipeline)

### 4.1 Input and Scope

- **Input**: `PaperInput`: `paper_id`, `title?`, `raw_text`, `metadata?`.
- **Scope**: Single tenant (`tenantId`). A `DatabaseClient` is created with that tenant; all reads/writes use it (client injects `tenant_id` on insert and filters on it for selects).

### 4.2 Stages (Order)

1. **Existence check**: If paper already exists and not `forceReingest`, return early (idempotent).
2. **Load tenant settings**: Execution mode (hosted vs BYOK), API key (decrypted if BYOK), reasoning depth, relationship type allowlist, etc.
3. **Ingestion**: Raw text (trimmed to 60k chars) → LLM (Ingestion agent) → Zod-validated sections. Upsert paper row; optionally compute and store paper embedding.
4. **Sections persistence**: Sections written to DB (or read from derived cache keyed by hash of paper_id + sections + schema/prompt versions).
5. **Entity extraction**: Sections → Entity agent → up to 10 entities per call (Zod). Types and names canonicalized later.
6. **Relationship extraction**: Entities + sections → Relationship Core agent → up to 12 edges (source, target, type, confidence); no evidence yet. Output filtered by tenant `enabled_relationship_types` if set.
7. **Validation**: `validateEntitiesAndEdges` (see below)—pure function, no LLM. Produces `validated_entities` and `validated_edges` with decisions (approved / flagged / rejected) and reasons.
8. **Entity persistence**: For each validated entity: exact match lookup by (canonical_name, type). If no match and API key present: entity embedding (via EntityEmbeddingService), then EntityResolver (two-tier: exact then semantic). New nodes get `embedding_raw`/`embedding_index`; semantic matches create `entity_links` (approved or proposed). Aliases and entity_mentions written. All entities (including rejected/flagged) can be persisted for review; implementation persists validated set and uses decisions for `review_status`.
9. **Paper node**: Ensure a node with `canonical_name = paper_id`, `type = 'Paper'` exists; add to entity map for edges.
10. **Edge persistence**: Map source/target canonical names to node IDs via entity map; insert edges (evidence initially empty for some). Rejected edges are still inserted with appropriate `review_status` so they appear in review queue.
11. **Evidence enrichment**: For approved/flagged edges only, Relationship Evidence agent extracts verbatim evidence (max 300 chars) from sections; edge rows updated with `evidence` and `provenance`.
12. **Reasoning (optional)**: If `runReasoning`: build subgraph (depth-2 around affected papers, or full graph if env set), hash subgraph for cache; if cache miss, run Reasoning agent on subgraph JSON, then insert insights with `reasoning_path` including scope metadata.

Progress callbacks and logging are used throughout; pipeline returns `PipelineResult` (success, paper_id, stats, optional error).

### 4.3 Caching

- **Derived cache**: Keyed by content hash + schema/prompt versions. Used for sections, relationship_candidates, entities (merged entity map), graph_snapshot. Reduces duplicate LLM/DB work on re-runs with same inputs.
- **Agent output cache**: In `runAgent`, cache key includes tenant, model, prompt/schema versions, and input hash; reads/writes go through `src/utils/cache.ts` and `src/cache/derived.ts`.

---

## 5. Validation (Deterministic)

Implemented in `src/agents/validationRules.ts`. No LLM.

### 5.1 Constants

- Confidence &lt; 0.3 → reject.
- 0.3 ≤ confidence &lt; 0.6 → flagged.
- Confidence ≥ 0.6 → approved.
- Orphan penalty: single-mention entities get additive penalty 0.10 before bucket check.
- Duplicate detection: Levenshtein distance &lt; 3 within same type and name-prefix bucket; loser flagged or rejected, winner unchanged.

### 5.2 Entity Pass

- Canonicalize names (lowercase, normalize).
- Build canonical entity set and mention counts; apply orphan penalty; find duplicate groups (same type, bucket, Levenshtein &lt; 3).
- Resolve duplicates: sort by adjusted confidence (then lexicographic); winner keeps approval bucket, losers get `duplicate_of:<winner>` and flagged/rejected.
- Output: per-entity decision, original/adjusted confidence, reason string (e.g. `orphan_entity:single_mention`, `low_confidence:0.45`, `duplicate_of:xyz`).

### 5.3 Edge Pass

- Self-loop (source_canonical === target_canonical) → rejected, reason `self_reference`.
- Unknown endpoint (source or target not in validated entity set) → rejected (structural invalidity).
- Otherwise same confidence buckets: &lt;0.3 reject, 0.3–0.6 flagged, ≥0.6 approved.

Result: `ValidationOutput` with `validated_entities` and `validated_edges`; pipeline never promotes data to approved based on LLM alone.

---

## 6. Entity Resolution (Two-Tier)

In pipeline, after validation, for each entity without an exact (canonical_name, type) match:

### 6.1 Tier A (Exact)

- Lookup in DB by canonicalized name + type. Hit → use existing node, record alias, no new node.

### 6.2 Tier B (Semantic)

- **EntityEmbeddingService**: Builds context (name, type, definition, paper title, evidence snippet); calls embedding API; returns 3072-d and 768-d (or equivalent) for storage.
- **EntityResolver**: Uses DB to find candidates via embedding similarity (e.g. `find_similar_nodes`), then:
  - Shared phrase/definition and high similarity → can auto-approve link.
  - `shouldAutoApprove`: similarity ≥ type threshold (e.g. 0.95 for Method/Concept), plus (shared alias OR shared phrase); never auto-approve short acronyms (length ≤ 5).
- Resolution actions: `exact_match` (use existing); `auto_approve` (create new node + approved `alias_of` link); `propose_link` (new node + proposed link); `create_new` (no link).
- **selectCanonicalNode**: When multiple candidates, pick by mention count (desc), then created_at (asc), then canonical_name (asc). Used when resolving which node is canonical among duplicates.

Pipeline: create new node with embeddings; if link, insert into `entity_links` with status approved or proposed. Cycle prevention: if canonical itself has an approved alias, resolve to the final canonical before creating link.

---

## 7. Corpus Selection (Unified)

`src/ingest/unified/selection.ts`:

- **Retrieval phase**: Semantic Scholar (citations, references, keyword queries) and arXiv (title/category search) in parallel; `Promise.allSettled`; merge and dedupe by stable id (paperId / arxivId). High recall, best-effort per source.
- **Semantic gating**: Seed paper (title + abstract) embedded; candidates (title + abstract) embedded; cosine similarity computed; filter by threshold (default 0.7); rank by similarity; take top `maxSelectedPapers` (e.g. 100). Caps `maxCandidatesToEmbed` (e.g. 500) before embedding to limit cost.
- **Optional temporal rerank**: Configurable weight between similarity and recency (e.g. recent year window).
- **Reuse**: If DB has embeddings for papers, they can be used instead of re-calling embedding API (caller passes DB client and selection uses it where implemented).

This guarantees that inclusion is decided by semantic similarity, not by retrieval source alone.

---

## 8. Reasoning (Incremental)

- **buildSubgraph** (`src/reasoning/buildSubgraph.ts`): Given `affectedPaperIds` and depth (default 2), either:
  - Full graph: fetch all nodes/edges/papers (when `REASON_FULL_GRAPH=1`), or
  - Bounded: get nodes/edges for affected papers (approved only), then expand by depth: collect neighbor nodes/edges in chunks (REASONING_CHUNK_SIZE), up to depth 2.
- Subgraph serialized to JSON (nodes, edges, papers, total_papers_in_corpus); hashed for cache.
- **Reasoning agent**: LLM consumes subgraph, returns insights (e.g. transitive_relationship, concept_cluster, anomaly_detection) with subject_nodes and reasoning_path.
- Insights inserted with `reasoning_path.meta` containing batch_id, graph_snapshot_hash, scope (paper_ids, depth). So reasoning cost scales with affected region, not full corpus.

---

## 9. Agents (LLM)

- **runAgent** (`src/agents/runAgent.ts`): Generic runner for Gemini. Builds cache key from tenant, model, prompt/schema versions, input hash. On cache hit returns cached result; on miss calls API with structured output (Zod schema), retries on schema failure (maxRetries). Tracks usage (tokens, cost) when usage tracking enabled. Supports `apiKeyOverride` for BYOK.
- **Progressive degradation** (relationship extraction): Normal (full evidence) → Compact (no evidence) → Minimal (max 8 edges). On truncation/schema failure, retry with next mode so pipeline can complete with partial output.
- **Prompts**: Ingestion (sections), Entity (up to 10 entities), Relationship Core (up to 12 edges), Relationship Evidence (evidence per edge), Reasoning (insights from subgraph). All in `src/agents/prompts/`.
- **Schemas**: Zod in `src/agents/schemas.ts` (Ingestion, Entity, RelationshipCore, RelationshipEvidence, Validation, Insight). Max lengths and enums enforce bounded, typed output.

---

## 10. API Layer

- **Server**: Fastify, CORS (configurable origins + Vercel preview patterns), global error handler. Health at `GET /health` (no auth). All other API routes behind tenant context.
- **Tenant resolution** (`tenantAuth.ts`): `requireTenant`: Extract user from `Authorization: Bearer <JWT>` (Supabase Auth); resolve tenant from `x-tenant-id` header, or from URL (e.g. tenant slug → lookup in Supabase), or from user’s first tenant in `tenant_users`. Verify user has access to resolved tenant (except default tenant). Set `request.tenantId`, `request.userId`, `request.userEmail`. `optionalTenant`: same resolution but no 403 if missing. `requireUser`: require Bearer or valid `x-api-key` (server API_KEY).
- **Database**: Each request that needs DB gets a `DatabaseClient` created with `request.tenantId` (e.g. in route handlers or controllers). All queries are thus tenant-scoped via client’s `tenantId`.
- **Routes**: Papers, graph (neighborhood, viewport, subgraph, full), edges, search (full-text + semantic), insights, stats, pipeline (process, process-file, process-url, status, jobs), nodes, entity-links, settings, tenants, review, export, usage. See `src/api/README.md`. Graph/read routes use `requireTenant` only (tenant from header/slug/user or default); pipeline and settings use `requireUser` + `requireTenant`. Pipeline and settings enforce rate limits and usage limits (cost/token) when configured; demo accounts can be blocked from running pipeline.

---

## 11. Frontend

- **Stack**: React, Vite, TypeScript, Zustand (graph store), TanStack Query (server state).
- **Auth**: Supabase Auth (AuthProvider); login/signup; token and tenant id stored (e.g. localStorage) and sent as Bearer + `x-tenant-id` on API calls.
- **App**: Auth gate → main app or login/account-finalization. Main: AppLayout (sidebar filters, user bar), KnowledgeGraph (force-directed), EntityDetailPanel, InsightsPanel, EdgeModal, SearchModal, Settings, Review queue, Agent runner (run pipeline). Read-only banner when not signed in.
- **Graph**: Data from `GET /api/graph` (or neighborhood); nodes/edges with types and confidence; filters (entity type, relationship type, confidence, year); selection and hover; colors by type. Store holds graphData, filters, selection, search query.
- **API client**: Centralized fetch with base URL, Bearer token, `x-tenant-id`; error parsing; methods for graph, papers, nodes, edges, search, pipeline, settings, tenants, etc. Mock mode for local dev without backend.

---

## 12. Multi-Tenancy and Auth Summary

- **Tenant ID**: Resolved per request (header, slug, or user’s tenant); all DB access through `DatabaseClient(tenantId)`.
- **Auth**: Supabase JWT for user identity; optional API key for server-to-server. Demo accounts can be restricted (e.g. no pipeline run).
- **BYOK**: Tenant can set `execution_mode = 'byo_key'` and store encrypted API key in `tenant_settings`; pipeline and agents use decrypted key for Gemini/embedding calls so host does not pay.
- **Feature flags**: `ENABLE_MULTI_TENANT`, `ENABLE_USAGE_TRACKING`, `ENABLE_HOSTED_QUEUE`, `ENABLE_BILLING` (see `src/config/featureFlags.ts`). OSS runs without multi-tenant orchestration; default tenant suffices.

---

## 13. Usage and Limits

- **Usage tracking**: Optional service records token and cost per tenant (and optionally user/job). Stored in DB (migrations: add_usage_tracking, add_usage_limits).
- **Usage limits**: Tenant settings can set monthly/daily cost and token limits. Pipeline (and optionally other paths) call usage limit check before running; exceeded → 403 with message.
- **Rate limiting**: Pipeline controller maintains per-tenant rate limit (e.g. N requests per minute) to avoid burst abuse.

---

## 14. Design Decisions and Trade-offs

- **Semantic gating before extraction**: Ensures expensive LLM work is only on papers that pass similarity threshold; retrieval is high-recall, gating is the authority for inclusion.
- **Fixed ontology**: Entity types (e.g. Method, Concept, Dataset, Metric) and relationship types (e.g. improves_on, uses, evaluates) are fixed in validation and schema; enables deterministic rules and SQL querying; no schema drift from LLM.
- **Evidence-first edges**: Every edge has evidence (max 300 chars) and provenance; no relationship without traceable support.
- **Link-based canonicalization**: Avoids destructive merges; every alias decision is in `entity_links` and can be reverted or reviewed.
- **Incremental reasoning**: Subgraph + cache keeps reasoning cost bounded by change, not corpus size.
- **Progressive degradation**: Relationship agent falls back to compact/minimal modes so one long paper does not kill the pipeline.
- **Precision over recall**: Stricter confidence and structural checks (e.g. 76% edge approval) keep graph trustworthy; flagged/rejected items still stored for review.

---

## 15. File and Module Map (Key Paths)

| Concern | Paths |
|--------|--------|
| Pipeline | `src/pipeline/runPipeline.ts`, `runReasoningBatch.ts`, `types.ts` |
| Validation | `src/agents/validationRules.ts`, `schemas.ts` |
| Entity resolution | `src/entities/resolver.ts`, `embeddingService.ts`, `sharedPhrase.ts` |
| Corpus selection | `src/ingest/unified/selection.ts`, `semanticScholar/`, `arxiv/` |
| Reasoning | `src/reasoning/buildSubgraph.ts` |
| Agents | `src/agents/runAgent.ts`, `config.ts`, `prompts/`, `errors.ts` |
| DB | `src/db/client.ts`, `migrations/*.sql` |
| API | `src/api/server.ts`, `routes/*.ts`, `controllers/*.ts`, `middleware/tenantAuth.ts` |
| Views / SQL | `sql/schema.sql`, `views/nodes_resolved.sql`, `edges_resolved.sql`, `functions/find_similar_*.sql` |
| Frontend | `frontend/src/App.tsx`, `api/client.ts`, `stores/graphStore.ts`, `components/` |
| Config | `src/config/featureFlags.ts`, `env.example` |

This breakdown should be sufficient for technical review of correctness, detail, and alignment with the stated problem and solutions.

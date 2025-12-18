# pgvector for Semantic Gating: Analysis & Implementation Plan

## Executive Summary

**Yes, storing embeddings in pgvector would significantly speed up the Semantic Gating phase**, especially for:
- Papers already ingested into the database
- Repeated queries with the same seed papers
- Large candidate pools (currently capped at 500)

**Current Bottlenecks:**
1. API calls to Gemini for embedding generation (even with file cache, first-time hits are slow)
2. In-memory cosine similarity computation for all candidates
3. No persistence of embeddings across runs

**pgvector Benefits:**
1. **Eliminate redundant API calls**: Papers already in DB have embeddings stored
2. **Native vector search**: PostgreSQL's pgvector extension provides optimized similarity search
3. **Batch efficiency**: Can query many candidates in a single SQL query
4. **Persistence**: Embeddings survive across runs and deployments

---

## Performance Impact Analysis

### Current Flow (Semantic Gating Phase)

```
For each run:
1. Normalize seed paper text (title + abstract)
2. Check file cache → if miss, call Gemini API (~100-300ms per embedding)
3. Normalize all candidate texts (up to 500)
4. Check file cache for each → if miss, batch API calls (~32 per batch)
5. Compute cosine similarity in-memory for all candidates
6. Filter by threshold, rank, select top K
```

**Time breakdown (typical run with 500 candidates, 50% cache hit rate):**
- Seed embedding: 50-150ms (cache hit) or 200-400ms (cache miss)
- Candidate embeddings: 250 × 200ms = ~50s (cache misses) + 250 × 50ms = ~12.5s (cache hits) = **~62.5s total**
- Cosine similarity computation: ~10-50ms (negligible)
- **Total: ~63-65 seconds**

### With pgvector

```
For each run:
1. Check DB for seed paper embedding → if exists, load (~1-5ms)
   → if not, compute and store
2. Query DB for candidate embeddings (single SQL query with vector similarity)
   → Returns pre-computed embeddings + similarity scores
3. For candidates not in DB, compute embeddings and store
4. Merge results, filter, rank
```

**Time breakdown (same scenario, assuming 80% of candidates already in DB):**
- Seed embedding: 1-5ms (DB hit) or 200-400ms (compute + store)
- Candidate embeddings from DB: Single SQL query with vector search = **~50-200ms** for 400 papers
- Remaining 100 candidates: 100 × 200ms = ~20s
- **Total: ~20-25 seconds** (60-70% faster)

**Best case (all candidates in DB):**
- **Total: ~0.2-0.5 seconds** (99% faster)

---

## Implementation Requirements

### 1. Database Schema Changes

#### Add pgvector Extension
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### Modify `papers` Table
```sql
-- Add embedding column (gemini-embedding-001 produces 768-dimensional vectors)
ALTER TABLE papers 
ADD COLUMN embedding vector(768);

-- Add index for efficient similarity search
-- Using HNSW index for best performance (PostgreSQL 15+)
CREATE INDEX IF NOT EXISTS idx_papers_embedding_hnsw 
ON papers 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Alternative: IVFFlat index (works on older PostgreSQL versions)
-- CREATE INDEX IF NOT EXISTS idx_papers_embedding_ivfflat
-- ON papers
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);
```

#### Migration Script
Create `sql/migrations/add_embeddings.sql`:
```sql
-- Migration: Add pgvector support for paper embeddings
-- Run this after ensuring pgvector extension is installed

BEGIN;

-- Add extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column
ALTER TABLE papers 
ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create index (adjust based on PostgreSQL version)
-- For PostgreSQL 15+:
CREATE INDEX IF NOT EXISTS idx_papers_embedding_hnsw 
ON papers 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

COMMIT;
```

### 2. TypeScript Type Updates

#### Update Database Client Types
```typescript
// src/db/client.ts
export interface Paper {
  paper_id: string;
  title: string | null;
  abstract: string | null;
  year: number | null;
  metadata: Record<string, unknown> | null;
  embedding: number[] | null;  // Add this
  created_at: string;
}

export interface InsertPaper {
  paper_id: string;
  title?: string;
  abstract?: string;
  year?: number;
  metadata?: Record<string, unknown>;
  embedding?: number[];  // Add this
}
```

### 3. Database Client Methods

Add methods to `DatabaseClient`:

```typescript
// src/db/client.ts

/**
 * Store or update embedding for a paper
 */
async upsertPaperEmbedding(
  paperId: string, 
  embedding: number[]
): Promise<void> {
  const { error } = await this.client
    .from('papers')
    .update({ embedding })
    .eq('paper_id', paperId);
  
  if (error) {
    throw new Error(`Failed to upsert embedding: ${error.message}`);
  }
}

/**
 * Get embedding for a paper
 */
async getPaperEmbedding(paperId: string): Promise<number[] | null> {
  const { data, error } = await this.client
    .from('papers')
    .select('embedding')
    .eq('paper_id', paperId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to get embedding: ${error.message}`);
  }
  
  return data?.embedding as number[] | null;
}

/**
 * Find papers similar to a query embedding using pgvector
 * Returns papers with similarity scores
 */
async findSimilarPapers(params: {
  queryEmbedding: number[];
  limit?: number;
  similarityThreshold?: number;
  excludePaperIds?: string[];
}): Promise<Array<{
  paper_id: string;
  title: string | null;
  abstract: string | null;
  year: number | null;
  similarity: number;  // Cosine similarity (1 - distance)
}>> {
  const { queryEmbedding, limit = 100, similarityThreshold = 0, excludePaperIds = [] } = params;
  
  // Convert to PostgreSQL vector format
  const vectorStr = `[${queryEmbedding.join(',')}]`;
  
  // Build query
  let query = this.client
    .from('papers')
    .select('paper_id, title, abstract, year, embedding')
    .not('embedding', 'is', null);
  
  // Exclude specific papers
  if (excludePaperIds.length > 0) {
    query = query.not('paper_id', 'in', excludePaperIds);
  }
  
  // Execute query and compute similarity in application
  // Note: Supabase/PostgREST doesn't directly support pgvector operators
  // We'll need to use a raw SQL query or RPC function
  
  const { data, error } = await this.client.rpc('find_similar_papers', {
    query_embedding: vectorStr,
    similarity_threshold: similarityThreshold,
    result_limit: limit,
    exclude_ids: excludePaperIds,
  });
  
  if (error) {
    throw new Error(`Failed to find similar papers: ${error.message}`);
  }
  
  return (data || []).map((row: any) => ({
    paper_id: row.paper_id,
    title: row.title,
    abstract: row.abstract,
    year: row.year,
    similarity: row.similarity,
  }));
}
```

### 4. PostgreSQL Function for Similarity Search

Create `sql/functions/find_similar_papers.sql`:

```sql
-- Function to find similar papers using pgvector
CREATE OR REPLACE FUNCTION find_similar_papers(
  query_embedding vector(768),
  similarity_threshold float DEFAULT 0.0,
  result_limit int DEFAULT 100,
  exclude_ids text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE (
  paper_id text,
  title text,
  abstract text,
  year int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.paper_id,
    p.title,
    p.abstract,
    p.year,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM papers p
  WHERE 
    p.embedding IS NOT NULL
    AND (exclude_ids IS NULL OR p.paper_id != ALL(exclude_ids))
    AND (1 - (p.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT result_limit;
END;
$$;
```

### 5. Modify Embedding Pipeline

Update `src/pipeline/runPipeline.ts` to compute and store embeddings:

```typescript
// In runPipeline function, after upsertPaper:

// Compute and store embedding for the paper
if (googleApiKey) {
  try {
    const emb = new EmbeddingsClient(googleApiKey);
    const paperText = normalizeTextForEmbedding(
      ingested.title || '',
      abstractSection?.content || ''
    );
    const [embedding] = await emb.embedTexts([paperText], 'gemini-embedding-001');
    
    if (embedding) {
      await dbClient.upsertPaperEmbedding(ingested.paper_id, embedding);
      logger.info(`[Pipeline] Stored embedding for ${ingested.paper_id}`);
    }
  } catch (err) {
    logger.warn(`[Pipeline] Failed to store embedding: ${err}`);
    // Don't fail the pipeline if embedding storage fails
  }
}
```

### 6. Modify Semantic Gating Phase

Update `src/ingest/unified/selection.ts`:

```typescript
async function applySemanticGating(params: {
  seed: UnifiedPaper;
  candidates: UnifiedPaper[];
  googleApiKey: string;
  config: SelectionConfig;
  db?: DatabaseClient;  // Add DB client
  logger?: { info: (msg: string, ctx?: Record<string, unknown>) => void };
}): Promise<{...}> {
  const { seed, candidates, googleApiKey, config, db, logger } = params;
  const log = logger || { info: console.log };
  const emb = new EmbeddingsClient(googleApiKey);

  // Step 1: Get or compute seed embedding
  let seedVec: EmbeddingVector;
  if (db && seed.paperId) {
    const cached = await db.getPaperEmbedding(seed.paperId);
    if (cached) {
      seedVec = cached;
      log.info('[SemanticGating] Loaded seed embedding from DB');
    } else {
      const seedText = normalizeTextForEmbedding(seed.title, seed.abstract);
      const [computed] = await emb.embedTexts([seedText], config.embeddingsModel);
      if (!computed) throw new Error('Seed embedding failed');
      seedVec = computed;
      
      // Store for future use
      try {
        await db.upsertPaperEmbedding(seed.paperId, seedVec);
      } catch (err) {
        log.warn('[SemanticGating] Failed to store seed embedding', { err });
      }
    }
  } else {
    const seedText = normalizeTextForEmbedding(seed.title, seed.abstract);
    const [computed] = await emb.embedTexts([seedText], config.embeddingsModel);
    if (!computed) throw new Error('Seed embedding failed');
    seedVec = computed;
  }

  // Step 2: Get candidates with embeddings from DB
  const candidatesToEmbed = candidates.slice(0, config.maxCandidatesToEmbed);
  const candidateIds = candidatesToEmbed.map(p => p.paperId).filter(Boolean);
  
  let dbResults: Array<{ paper_id: string; similarity: number }> = [];
  let candidatesNeedingEmbedding = candidatesToEmbed;
  
  if (db && candidateIds.length > 0) {
    try {
      // Query DB for similar papers
      const similar = await db.findSimilarPapers({
        queryEmbedding: seedVec,
        limit: config.maxCandidatesToEmbed * 2, // Get more to account for filtering
        similarityThreshold: config.semanticThreshold,
        excludePaperIds: [seed.paperId],
      });
      
      // Map results
      const dbResultMap = new Map(similar.map(s => [s.paper_id, s.similarity]));
      dbResults = similar;
      
      // Filter out candidates that were found in DB
      candidatesNeedingEmbedding = candidatesToEmbed.filter(
        p => !p.paperId || !dbResultMap.has(p.paperId)
      );
      
      log.info('[SemanticGating] Found embeddings in DB', {
        fromDb: dbResults.length,
        needComputation: candidatesNeedingEmbedding.length,
      });
    } catch (err) {
      log.warn('[SemanticGating] DB query failed, computing all embeddings', { err });
      candidatesNeedingEmbedding = candidatesToEmbed;
    }
  }

  // Step 3: Compute embeddings for candidates not in DB
  let computedResults: Array<{ paper: UnifiedPaper; sim: number }> = [];
  
  if (candidatesNeedingEmbedding.length > 0) {
    const candidateTexts = candidatesNeedingEmbedding.map((p) => 
      normalizeTextForEmbedding(p.title, p.abstract)
    );
    const candVecs = await emb.embedTexts(candidateTexts, config.embeddingsModel);
    
    computedResults = candidatesNeedingEmbedding.map((p, i) => ({
      paper: p,
      sim: cosineSimilarity(seedVec, candVecs[i]!),
    }));
    
    // Store computed embeddings in DB
    if (db) {
      const storePromises = candidatesNeedingEmbedding.map(async (p, i) => {
        if (p.paperId && candVecs[i]) {
          try {
            await db.upsertPaperEmbedding(p.paperId, candVecs[i]!);
          } catch (err) {
            // Non-fatal
          }
        }
      });
      await Promise.allSettled(storePromises);
    }
  }

  // Step 4: Merge DB results with computed results
  const dbResultsMapped = dbResults
    .map(dbResult => {
      const candidate = candidatesToEmbed.find(p => p.paperId === dbResult.paper_id);
      if (!candidate) return null;
      return {
        paper: candidate,
        sim: dbResult.similarity,
      };
    })
    .filter((x): x is { paper: UnifiedPaper; sim: number } => x !== null);
  
  const withSim = [...dbResultsMapped, ...computedResults];
  
  // Continue with existing filtering/ranking logic...
  // (rest of the function remains the same)
}
```

### 7. Update Selection Function Signature

```typescript
// src/ingest/unified/selection.ts
export async function selectCorpusUnified(params: {
  seedTitle: string;
  seedAuthors?: string[];
  ssApiKey?: string;
  googleApiKey: string;
  db?: DatabaseClient;  // Add optional DB client
  config?: Partial<SelectionConfig>;
  logger?: {...};
}): Promise<{...}> {
  // Pass db to applySemanticGating
  const { selected, gatingStats } = await applySemanticGating({
    seed,
    candidates,
    googleApiKey: params.googleApiKey,
    config: cfg,
    db: params.db,  // Pass through
    logger,
  });
  // ...
}
```

---

## Migration Strategy

### Phase 1: Schema Setup (Non-Breaking)
1. Add pgvector extension
2. Add `embedding` column (nullable)
3. Create index
4. Deploy database function

### Phase 2: Backfill Existing Papers (Optional)
Create a script to compute and store embeddings for existing papers:

```typescript
// scripts/backfill_embeddings.ts
async function backfillEmbeddings() {
  const db = createDatabaseClient();
  const emb = new EmbeddingsClient(process.env.GOOGLE_API_KEY!);
  
  const papers = await db.getAllPapers(); // Need to add this method
  
  for (const paper of papers) {
    if (paper.embedding) continue; // Skip if already has embedding
    
    const text = normalizeTextForEmbedding(paper.title || '', paper.abstract || '');
    const [embedding] = await emb.embedTexts([text], 'gemini-embedding-001');
    
    if (embedding) {
      await db.upsertPaperEmbedding(paper.paper_id, embedding);
      console.log(`Backfilled ${paper.paper_id}`);
    }
  }
}
```

### Phase 3: Enable in Pipeline
1. Update `runPipeline` to store embeddings
2. Update `selectCorpusUnified` to accept DB client
3. Update `applySemanticGating` to use DB when available
4. Deploy with feature flag (optional)

---

## Considerations & Trade-offs

### Advantages
✅ **Massive speedup** for papers already in database  
✅ **Reduced API costs** (fewer Gemini embedding calls)  
✅ **Better scalability** (vector search scales better than in-memory)  
✅ **Persistence** across deployments  
✅ **No external dependencies** (uses existing Postgres)

### Challenges
⚠️ **Supabase/PostgREST limitations**: May need raw SQL or RPC functions for vector operations  
⚠️ **Storage overhead**: ~3KB per embedding (768 floats × 4 bytes)  
⚠️ **Migration complexity**: Need to handle existing papers  
⚠️ **Index maintenance**: HNSW indexes need periodic maintenance on large datasets

### Alternatives Considered
1. **Separate vector DB (Pinecone, Weaviate)**: More complexity, additional infrastructure
2. **Keep file cache only**: Works but not persistent, slower for large datasets
3. **Hybrid approach**: Use DB for ingested papers, file cache for external candidates

---

## Recommended Approach

**Hybrid Strategy** (Best of both worlds):
1. Store embeddings in pgvector for papers in the database
2. Keep file cache for external candidates (arXiv, Semantic Scholar) not yet ingested
3. Gradually migrate: as papers get ingested, their embeddings move to DB

This provides:
- Fast lookups for known papers (DB)
- Fallback for new candidates (file cache → API)
- No breaking changes
- Incremental migration path

---

## Testing Plan

1. **Unit tests**: Database client methods for embedding storage/retrieval
2. **Integration tests**: End-to-end semantic gating with DB
3. **Performance tests**: Benchmark before/after for typical workloads
4. **Migration tests**: Verify backfill script works correctly

---

## Estimated Implementation Time

- **Schema changes**: 1-2 hours
- **Database client updates**: 2-3 hours
- **Semantic gating modifications**: 3-4 hours
- **Pipeline integration**: 1-2 hours
- **Testing & debugging**: 3-4 hours
- **Backfill script**: 1-2 hours

**Total: ~12-17 hours** for a complete implementation

---

## Conclusion

Storing embeddings in pgvector would provide **significant performance improvements** (60-99% faster depending on cache hit rate) with **moderate implementation effort**. The hybrid approach (DB + file cache) offers the best balance of performance, persistence, and flexibility.

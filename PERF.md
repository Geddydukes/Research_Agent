# Performance Improvements - Second Pass

## Overview
This document summarizes the performance optimizations implemented in the second performance pass, focusing on real wall-time wins and correctness guardrails.

## Changes Implemented

### 1. Parallelized PDF Downloads and arXiv ID Resolution
**Files**: `src/ingest/semanticScholar/downloader.ts`, `src/ingest/semanticScholar/selection.ts`

- **PDF Downloads**: Replaced sequential for-loop with `Promise.all` in `downloadPdfsForSelected()`
  - Downloads now execute concurrently while respecting the `arxiv_download` limiter lane
  - Expected impact: 20 PDFs reduced from ~40s sequential to ~7s concurrent (5-6x faster)
  
- **arXiv ID Resolution**: Verified concurrent execution via `Promise.all` (already implemented)
  - `attachArxivId` calls use limiter lanes internally, allowing safe parallelism

### 2. Removed Redundant O(n) Loops in Edge Operations
**File**: `src/pipeline/runPipeline.ts`

- **Edge Insertion**: 
  - Built `edgeKeys[]` array aligned 1:1 with `edgesToInsert` during first pass
  - Eliminated second loop that re-iterated `validatedEdges` to map IDs
  - Single for-loop maps IDs: `edgeKeys[i] -> inserted[i].id`
  - Expected impact: Eliminates ~50-100 redundant iterations per paper
  
- **Edge Key Reuse**:
  - Computed edge keys once and reused throughout evidence enrichment path
  - Avoided recomputing `${source}::${type}::${target}` in multiple locations
  - Expected impact: Eliminates ~150 redundant string concatenations per paper

- **Evidence Input Serialization**:
  - JSON.stringify called once and reused for both agent call and cache keying
  - Expected impact: Saves ~5-20ms for large evidence inputs

- **Sections Mapping**:
  - Pre-computed sections for evidence input to avoid redundant mapping
  - Expected impact: Eliminates redundant map operation for 5-10 sections

### 3. Pre-canonicalize Validation Inputs
**File**: `src/agents/validationRules.ts`

- Added local memo cache `canonicalCache` with `getCanonical()` helper
- Used consistently across all validation paths to avoid repeated canonicalization
- Expected impact: Eliminates ~200-300 redundant `canonicalize()` calls per paper (~5-15ms savings)

### 4. Reasoning Scalability Guardrails
**Files**: `src/reasoning/buildSubgraph.ts`, `src/pipeline/runPipeline.ts`

- **Chunking for Large IN Clauses**:
  - Implemented chunking (default 1000, configurable via `REASONING_CHUNK_SIZE`)
  - Applied to depth traversal queries (source/target edges) and final node/edge fetches
  - Prevents query failures when node/edge arrays exceed database IN clause limits
  - Expected impact: Enables handling of 10K+ node graphs without failures

- **Removed Redundant Dedupe Set**:
  - Eliminated `seenEdgeIds` Set; `edgeIds` already guarantees uniqueness
  - Expected impact: Removes ~1000 extra Set lookups per 1000 edges (~0.5-2ms)

- **Safety Check for Full Graph Fetch**:
  - Per-paper reasoning now uses `buildSubgraph()` with subgraph fetch by default
  - Full graph fetch only occurs when `REASON_FULL_GRAPH=1` is explicitly set
  - Expected impact: Prevents accidental full corpus loads in per-paper mode

### 5. Micro-optimizations
**Files**: `src/ingest/semanticScholar/selection.ts`

- **LinkedIds Set Construction**:
  - Build Set directly instead of creating intermediate arrays
  - Changed from `new Set([...citing.map(...), ...refs.map(...)])` to direct iteration
  - Expected impact: Eliminates intermediate array creation (~0.1-0.5ms)

## Expected Performance Impact

### Wall Time Improvements
- **PDF Downloads**: 5-6x faster (40s → 7s for 20 PDFs)
- **Edge Processing**: ~10-20ms reduction per paper (eliminated redundant loops)
- **Validation**: ~5-15ms reduction per paper (memoized canonicalization)
- **Reasoning**: Scalable to 10K+ nodes without query failures

### Memory Improvements
- Reduced intermediate array allocations
- Eliminated redundant string concatenations
- More efficient Set operations

### Correctness Improvements
- Prevented accidental full graph loads in per-paper reasoning
- Ensured database query limits are respected via chunking
- Maintained deterministic behavior while improving performance

## Testing Recommendations

Run with `INGEST_LIMIT=10` to verify:
- Wall time improvements in download phase
- No regressions in success counts
- Correctness of edge mapping and evidence enrichment
- Proper subgraph construction in reasoning

## Configuration

New environment variables:
- `REASONING_CHUNK_SIZE`: Chunk size for database IN clauses (default: 1000)
- `REASON_FULL_GRAPH`: Set to '1' to use full corpus in reasoning (default: disabled)

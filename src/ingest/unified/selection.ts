/**
 * Unified paper selection with explicit retrieval and semantic gating phases.
 * 
 * This module ensures that semantic similarity (embeddings + cosine similarity)
 * is the authoritative gating mechanism for which papers are ingested, regardless
 * of which retrieval source produced the candidates.
 * 
 * Architecture:
 * 1. Retrieval Phase: High-recall candidate gathering from multiple sources
 * 2. Semantic Gating Phase: Embedding-based filtering and ranking
 */

import type { SSPaper } from '../semanticScholar/client';
import { SemanticScholarClient } from '../semanticScholar/client';
import { ArxivClient, type ArxivPaper } from '../arxiv/client';
import { EmbeddingsClient } from '../../embeddings/embed';
import { cosineSimilarity, normalizeTextForEmbedding } from '../../embeddings/similarity';
import { withRetry } from '../../utils/retry';
import { extractArxivId, searchArxivByTitle } from '../arxiv/util';
import type { DatabaseClient } from '../../db/client';

export type SelectionReason = 'seed' | 'semantic';

export type UnifiedPaper = (SSPaper | ArxivPaper) & {
  source: 'semantic_scholar' | 'arxiv';
  arxivId?: string | null;
};

export type SelectedPaper = UnifiedPaper & {
  selection_reason: SelectionReason;
  sim_to_seed: number;
  temporal_score?: number;
};

type SelectionConfig = {
  semanticThreshold: number;
  maxCandidatesToEmbed: number;
  maxSelectedPapers: number;
  embeddingsModel: string;
  // Retrieval config
  ssCitationLimit: number;
  ssReferenceLimit: number;
  ssKeywordLimit: number;
  ssKeywordQueries: string[];
  arxivSearchMaxResults: number;
  arxivCategories: string[]; // e.g., ['cs.CV', 'cs.GR', 'cs.LG']
  // Temporal rerank config
  enableTemporalRerank: boolean;
  recentYearWindow: number; // e.g., 2 means 2023+ if current year is 2025
  temporalSimilarityWeight: number; // e.g., 0.7
  temporalYearWeight: number; // e.g., 0.3
};

export const defaultSelectionConfig: SelectionConfig = {
  semanticThreshold: 0.7,
  maxCandidatesToEmbed: 500,
  maxSelectedPapers: 100,
  embeddingsModel: 'gemini-embedding-001',
  ssCitationLimit: 100,
  ssReferenceLimit: 100,
  ssKeywordLimit: 60,
  ssKeywordQueries: [
    'Gaussian Splatting',
    '3D Gaussian Splatting',
    'splatting radiance field',
    'point-based radiance fields',
  ],
  arxivSearchMaxResults: 60,
  arxivCategories: ['cs.CV', 'cs.GR', 'cs.LG', 'cs.AI'],
  enableTemporalRerank: false,
  recentYearWindow: 2,
  temporalSimilarityWeight: 0.7,
  temporalYearWeight: 0.3,
};

function isPaperUsable(p: SSPaper | ArxivPaper): boolean {
  return Boolean(
    p.paperId &&
    p.title &&
    (p.abstract?.trim()?.length ?? 0) > 0 &&
    p.year
  );
}

function getStableId(p: UnifiedPaper): string {
  // Prefer paperId, fallback to arxivId
  if (p.paperId) return p.paperId;
  if (p.arxivId) return `arxiv:${p.arxivId}`;
  return `${p.source}:${p.title}`;
}

function yearWeight(year: number | undefined, recentYearWindow: number): number {
  if (!year) return 0.0;
  const currentYear = new Date().getFullYear();
  const yearsAgo = currentYear - year;
  if (yearsAgo <= recentYearWindow) {
    return 1.0 - (yearsAgo / recentYearWindow) * 0.5; // 1.0 for current year, 0.5 for window edge
  }
  return 0.0;
}

/**
 * Retrieval Phase: Gather candidates from all available sources.
 * Sources are attempted independently and failures do not block other sources.
 */
async function retrieveCandidates(params: {
  seedTitle: string;
  seedAuthors?: string[];
  ssApiKey?: string;
  config: SelectionConfig;
  logger?: { info: (msg: string, ctx?: Record<string, unknown>) => void; warn: (msg: string, ctx?: Record<string, unknown>) => void };
}): Promise<{
  seed: UnifiedPaper | null;
  candidates: UnifiedPaper[];
  retrievalStats: {
    ssCitations: number;
    ssReferences: number;
    ssKeywords: number;
    arxiv: number;
    total: number;
  };
}> {
  const { seedTitle, seedAuthors, ssApiKey, config, logger } = params;
  const log = logger || { info: console.log, warn: console.warn };

  const candidates: UnifiedPaper[] = [];
  const retrievalStats = {
    ssCitations: 0,
    ssReferences: 0,
    ssKeywords: 0,
    arxiv: 0,
    total: 0,
  };

  let seed: UnifiedPaper | null = null;

  // Try Semantic Scholar seed search
  if (ssApiKey) {
    try {
      const ss = new SemanticScholarClient(ssApiKey);
      log.info('[Retrieval] Searching for seed paper via Semantic Scholar', { title: seedTitle });
      const seedMatches = await withRetry(
        () => ss.searchPaperByTitle(seedTitle, 20),
        { tries: 3, baseMs: 500, maxMs: 4000 }
      );
      const usableSeeds = seedMatches.filter(isPaperUsable);
      if (usableSeeds.length > 0) {
        const bestSeed = usableSeeds.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))[0]!;
        seed = { ...bestSeed, source: 'semantic_scholar' as const };
        log.info('[Retrieval] Found seed via Semantic Scholar', { paperId: seed.paperId, title: seed.title });
      }
    } catch (err) {
      log.warn('[Retrieval] Semantic Scholar seed search failed, continuing', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // If no seed from SS, try arXiv
  if (!seed) {
    try {
      const arxiv = new ArxivClient();
      log.info('[Retrieval] Searching for seed paper via arXiv', { title: seedTitle });
      const arxivResults = await arxiv.search(seedTitle, 10);
      const usableSeeds = arxivResults.filter(isPaperUsable);
      if (usableSeeds.length > 0) {
        seed = { ...usableSeeds[0]!, source: 'arxiv' as const };
        log.info('[Retrieval] Found seed via arXiv', { paperId: seed.paperId, title: seed.title });
      }
    } catch (err) {
      log.warn('[Retrieval] arXiv seed search failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!seed) {
    throw new Error('No seed paper found from any source');
  }

  // Retrieve from Semantic Scholar sources (non-blocking)
  // Support simulated failures for testing (via SIMULATE_SS_FAILURES env var)
  const simulateFailures = process.env.SIMULATE_SS_FAILURES === '1';
  if (ssApiKey && !simulateFailures) {
    const ss = new SemanticScholarClient(ssApiKey);

    // Citations
    try {
      log.info('[Retrieval] Fetching citations', { paperId: seed.paperId, limit: config.ssCitationLimit });
      const citing = await withRetry(
        () => ss.getCitations(seed!.paperId, config.ssCitationLimit, 0),
        { tries: 3, baseMs: 500, maxMs: 4000 }
      );
      const usable = citing.filter(isPaperUsable);
      retrievalStats.ssCitations = usable.length;
      candidates.push(...usable.map((p) => ({ ...p, source: 'semantic_scholar' as const })));
      log.info('[Retrieval] Citations retrieved', { count: usable.length });
    } catch (err) {
      log.warn('[Retrieval] Citations fetch failed, continuing', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // References
    try {
      log.info('[Retrieval] Fetching references', { paperId: seed.paperId, limit: config.ssReferenceLimit });
      const refs = await withRetry(
        () => ss.getReferences(seed!.paperId, config.ssReferenceLimit, 0),
        { tries: 3, baseMs: 500, maxMs: 4000 }
      );
      const usable = refs.filter(isPaperUsable);
      retrievalStats.ssReferences = usable.length;
      candidates.push(...usable.map((p) => ({ ...p, source: 'semantic_scholar' as const })));
      log.info('[Retrieval] References retrieved', { count: usable.length });
    } catch (err) {
      log.warn('[Retrieval] References fetch failed, continuing', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Keyword searches
    for (const query of config.ssKeywordQueries) {
      try {
        log.info('[Retrieval] Keyword search', { query, limit: config.ssKeywordLimit });
        const results = await withRetry(
          () => ss.keywordSearch(query, config.ssKeywordLimit),
          { tries: 2, baseMs: 500, maxMs: 4000 }
        );
        const usable = results.filter(isPaperUsable);
        retrievalStats.ssKeywords += usable.length;
        candidates.push(...usable.map((p) => ({ ...p, source: 'semantic_scholar' as const })));
        log.info('[Retrieval] Keyword results', { query, count: usable.length });
      } catch (err) {
        log.warn('[Retrieval] Keyword search failed', { query, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } else if (simulateFailures) {
    // Simulate failures for testing
    log.warn('[Retrieval] Simulating Semantic Scholar failures (SIMULATE_SS_FAILURES=1)');
    log.warn('[Retrieval] Citations fetch failed, continuing', { error: 'simulated_failure' });
    log.warn('[Retrieval] References fetch failed, continuing', { error: 'simulated_failure' });
    log.warn('[Retrieval] Simulating keyword search failures');
  }

  // Always include arXiv search fallback
  try {
    const arxiv = new ArxivClient();
    const queries: string[] = [seedTitle];

    // Add author-based queries if available
    if (seedAuthors && seedAuthors.length > 0) {
      queries.push(`au:"${seedAuthors[0]}"`);
    }

    // Add category-based queries
    for (const cat of config.arxivCategories) {
      queries.push(`cat:${cat} AND all:"${seedTitle.split(' ').slice(0, 3).join(' ')}"`);
    }

    for (const query of queries) {
      try {
        log.info('[Retrieval] arXiv search', { query, maxResults: config.arxivSearchMaxResults });
        const results = await arxiv.search(query, config.arxivSearchMaxResults);
        const usable = results.filter(isPaperUsable);
        retrievalStats.arxiv += usable.length;
        candidates.push(...usable.map((p) => ({ ...p, source: 'arxiv' as const })));
        log.info('[Retrieval] arXiv results', { query, count: usable.length });
      } catch (err) {
        log.warn('[Retrieval] arXiv search failed', { query, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    log.warn('[Retrieval] arXiv retrieval failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Deduplicate by stable identifier
  const byId = new Map<string, UnifiedPaper>();
  for (const p of candidates) {
    const id = getStableId(p);
    if (!byId.has(id)) {
      byId.set(id, p);
    }
  }

  const deduplicated = Array.from(byId.values()).filter((p) => getStableId(p) !== getStableId(seed!));
  retrievalStats.total = deduplicated.length;

  log.info('[Retrieval] Phase complete', {
    seed: seed.title,
    candidates: deduplicated.length,
    stats: retrievalStats,
  });

  return { seed, candidates: deduplicated, retrievalStats };
}

/**
 * Semantic Gating Phase: Apply embedding-based filtering and ranking.
 * This is the authoritative gate - only papers passing semantic threshold proceed.
 */
async function applySemanticGating(params: {
  seed: UnifiedPaper;
  candidates: UnifiedPaper[];
  googleApiKey: string;
  tenantId: string;
  config: SelectionConfig;
  db?: DatabaseClient;
  logger?: { info: (msg: string, ctx?: Record<string, unknown>) => void };
}): Promise<{
  selected: SelectedPaper[];
  gatingStats: {
    candidatesEmbedded: number;
    similarityMin: number;
    similarityMax: number;
    similarityMedian: number;
    passingThreshold: number;
    selectedCount: number;
  };
}> {
  const { seed, candidates, googleApiKey, config, db, logger } = params;
  const log = logger || { info: console.log };
  const emb = new EmbeddingsClient(googleApiKey);

  // Step 1: Get or compute seed embedding
  let seedVec: number[];
  if (db && seed.paperId) {
    const cached = await db.getPaperEmbedding(seed.paperId);
    if (cached) {
      seedVec = cached;
      log.info('[SemanticGating] Loaded seed embedding from DB');
    } else {
      const seedText = normalizeTextForEmbedding(seed.title, seed.abstract);
      const [computed] = await emb.embedTexts([seedText], params.tenantId, config.embeddingsModel);
      if (!computed) throw new Error('Seed embedding failed');
      seedVec = computed;
      
      // Store for future use
      try {
        await db.upsertPaperEmbedding(seed.paperId, seedVec);
      } catch (err) {
        (log as { info: (m: string, o?: object) => void; warn: (m: string, o?: object) => void }).warn('[SemanticGating] Failed to store seed embedding', { err });
      }
    }
  } else {
    const seedText = normalizeTextForEmbedding(seed.title, seed.abstract);
    const [computed] = await emb.embedTexts([seedText], params.tenantId, config.embeddingsModel);
    if (!computed) throw new Error('Seed embedding failed');
    seedVec = computed;
  }

  // Step 2: Get candidates with embeddings from DB
  const candidatesToEmbed = candidates.slice(0, config.maxCandidatesToEmbed);
  const candidateIds = candidatesToEmbed.map(p => p.paperId).filter(Boolean) as string[];
  
  let dbResults: Array<{ paper: UnifiedPaper; sim: number }> = [];
  let candidatesNeedingEmbedding = candidatesToEmbed;
  
  if (db && candidateIds.length > 0) {
    try {
      // Query DB for similar papers
      const similar = await db.findSimilarPapers({
        queryEmbedding: seedVec,
        limit: config.maxCandidatesToEmbed * 2, // Get more to account for filtering
        similarityThreshold: config.semanticThreshold,
        excludePaperIds: [seed.paperId].filter(Boolean) as string[],
      });
      
      // Map results to candidates
      const dbResultMap = new Map(similar.map(s => [s.paper_id, s.similarity]));
      dbResults = candidatesToEmbed
        .filter(p => p.paperId && dbResultMap.has(p.paperId))
        .map(p => ({
          paper: p,
          sim: dbResultMap.get(p.paperId!)!,
        }));
      
      // Filter out candidates that were found in DB
      candidatesNeedingEmbedding = candidatesToEmbed.filter(
        p => !p.paperId || !dbResultMap.has(p.paperId)
      );
      
      log.info('[SemanticGating] Found embeddings in DB', {
        fromDb: dbResults.length,
        needComputation: candidatesNeedingEmbedding.length,
      });
    } catch (err) {
      (log as { info: (m: string, o?: object) => void; warn: (m: string, o?: object) => void }).warn('[SemanticGating] DB query failed, computing all embeddings', { err });
      candidatesNeedingEmbedding = candidatesToEmbed;
    }
  }

  // Step 3: Compute embeddings for candidates not in DB
  let computedResults: Array<{ paper: UnifiedPaper; sim: number }> = [];
  
  if (candidatesNeedingEmbedding.length > 0) {
    const candidateTexts = candidatesNeedingEmbedding.map((p) => 
      normalizeTextForEmbedding(p.title, p.abstract)
    );
    const candVecs = await emb.embedTexts(candidateTexts, params.tenantId, config.embeddingsModel);
    
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
            // Non-fatal, log but continue
          }
        }
      });
      await Promise.allSettled(storePromises);
    }
  }

  // Step 4: Merge DB results with computed results
  const withSim = [...dbResults, ...computedResults];

  const similarities = withSim.map((x) => x.sim).sort((a, b) => a - b);
  const similarityMin = similarities[0] ?? 0;
  const similarityMax = similarities[similarities.length - 1] ?? 0;
  const similarityMedian = similarities[Math.floor(similarities.length / 2)] ?? 0;

  // Filter by semantic threshold
  const passingThreshold = withSim.filter((x) => x.sim >= config.semanticThreshold);

  // Rank by similarity (descending)
  const ranked = passingThreshold.sort((a, b) => b.sim - a.sim);

  // Apply temporal rerank if enabled
  type RankedCandidate = { paper: UnifiedPaper; sim: number; temporalScore?: number };
  let finalRanked: RankedCandidate[] = ranked.map((x) => ({ ...x }));
  if (config.enableTemporalRerank) {
    const currentYear = new Date().getFullYear();
    finalRanked = ranked.map((x) => {
      const isRecent = x.paper.year && x.paper.year >= currentYear - config.recentYearWindow;
      if (isRecent) {
        const yw = yearWeight(x.paper.year, config.recentYearWindow);
        const temporalScore =
          config.temporalSimilarityWeight * x.sim + config.temporalYearWeight * yw;
        return { ...x, temporalScore };
      }
      return { ...x };
    });
    finalRanked.sort((a, b) => {
      const scoreA = a.temporalScore ?? a.sim;
      const scoreB = b.temporalScore ?? b.sim;
      return scoreB - scoreA;
    });
  }

  // Cap by maxSelectedPapers
  const capped = finalRanked.slice(0, config.maxSelectedPapers);

  // Build selected papers
  const selected: SelectedPaper[] = capped.map((x) => ({
    ...x.paper,
    selection_reason: 'semantic' as const,
    sim_to_seed: x.sim,
    temporal_score: x.temporalScore,
  }));

  const gatingStats = {
    candidatesEmbedded: candidatesToEmbed.length,
    similarityMin,
    similarityMax,
    similarityMedian,
    passingThreshold: passingThreshold.length,
    selectedCount: selected.length,
  };

  log.info('[SemanticGating] Phase complete', gatingStats);

  // Log top 5 selected papers
  const top5 = selected.slice(0, 5);
  log.info('[SemanticGating] Top 5 selected papers', {
    papers: top5.map((p) => ({
      title: p.title,
      similarity: p.sim_to_seed.toFixed(3),
      source: p.source,
      paperId: p.paperId,
    })),
  });

  return { selected, gatingStats };
}

/**
 * Main unified selection function.
 * Separates retrieval from semantic gating to ensure semantic similarity
 * is the authoritative gate regardless of retrieval source availability.
 */
export async function selectCorpusUnified(params: {
  seedTitle: string;
  seedAuthors?: string[];
  ssApiKey?: string;
  googleApiKey: string;
  tenantId: string;
  db?: DatabaseClient;
  config?: Partial<SelectionConfig>;
  logger?: {
    info: (msg: string, ctx?: Record<string, unknown>) => void;
    warn: (msg: string, ctx?: Record<string, unknown>) => void;
  };
}): Promise<{
  seed: UnifiedPaper;
  selected: SelectedPaper[];
  debug: {
    retrievalStats: {
      ssCitations: number;
      ssReferences: number;
      ssKeywords: number;
      arxiv: number;
      total: number;
    };
    gatingStats: {
      candidatesEmbedded: number;
      similarityMin: number;
      similarityMax: number;
      similarityMedian: number;
      passingThreshold: number;
      selectedCount: number;
    };
  };
}> {
  const cfg: SelectionConfig = { ...defaultSelectionConfig, ...(params.config ?? {}) };
  const logger = params.logger || {
    info: console.log,
    warn: console.warn,
  };

  // Phase 1: Retrieval
  const { seed, candidates, retrievalStats } = await retrieveCandidates({
    seedTitle: params.seedTitle,
    seedAuthors: params.seedAuthors,
    ssApiKey: params.ssApiKey,
    config: cfg,
    logger,
  });

  if (!seed) {
    throw new Error('No seed paper found');
  }

  // Phase 2: Semantic Gating
  const { selected, gatingStats } = await applySemanticGating({
    seed,
    candidates,
    googleApiKey: params.googleApiKey,
    tenantId: params.tenantId,
    config: cfg,
    db: params.db,
    logger,
  });

  // Attach arXiv IDs where possible (for download phase)
  logger.info('[Selection] Resolving arXiv IDs for selected papers');
  const withArxivPromises = selected.map(async (p) => {
    const direct = extractArxivId(p);
    if (direct) return { ...p, arxivId: direct };
    if (p.title) {
      const fromTitle = await searchArxivByTitle(p.title);
      if (fromTitle) return { ...p, arxivId: fromTitle };
    }
    return { ...p, arxivId: null };
  });
  const withArxiv = await Promise.all(withArxivPromises);

  // Resolve seed arXiv ID
  const seedDirect = extractArxivId(seed);
  let seedArxivId: string | null = seedDirect;
  if (!seedArxivId && seed.title) {
    seedArxivId = await searchArxivByTitle(seed.title);
  }
  const seedWithArxiv: SelectedPaper = {
    ...seed,
    arxivId: seedArxivId,
    selection_reason: 'seed' as const,
    sim_to_seed: 1.0,
  };

  // Seed is always first, followed by semantically-gated papers
  const finalSelected = [seedWithArxiv, ...withArxiv];

  logger.info('[Selection] Unified selection complete', {
    seed: seed.title,
    selectedCount: finalSelected.length,
    retrievalStats,
    gatingStats,
  });

  // Comprehensive summary for write-up proof
  const top5Selected = finalSelected.slice(1, 6); // Skip seed, get top 5
  logger.info('[Selection] SUMMARY: Semantic gating metrics', {
    retrievalBySource: {
      semanticScholarCitations: retrievalStats.ssCitations,
      semanticScholarReferences: retrievalStats.ssReferences,
      semanticScholarKeywords: retrievalStats.ssKeywords,
      arxiv: retrievalStats.arxiv,
      totalCandidates: retrievalStats.total,
    },
    embedding: {
      candidatesEmbedded: gatingStats.candidatesEmbedded,
    },
    similarity: {
      passingThreshold: gatingStats.passingThreshold,
      similarityRange: `[${gatingStats.similarityMin.toFixed(3)}, ${gatingStats.similarityMax.toFixed(3)}]`,
      similarityMedian: gatingStats.similarityMedian.toFixed(3),
      threshold: cfg.semanticThreshold,
    },
    selected: {
      count: gatingStats.selectedCount,
      top5: top5Selected.map((p) => ({
        title: p.title,
        similarity: p.sim_to_seed.toFixed(3),
        source: p.source,
      })),
    },
  });

  return {
    seed,
    selected: finalSelected,
    debug: {
      retrievalStats,
      gatingStats,
    },
  };
}

import type { SSPaper } from './client';
import { SemanticScholarClient } from './client';
import { EmbeddingsClient } from '../../embeddings/embed';
import { cosineSimilarity, normalizeTextForEmbedding } from '../../embeddings/similarity';
import { withRetry } from '../../utils/retry';
import { extractArxivId, searchArxivByTitle } from '../arxiv/util';

export type SelectionReason =
  | 'seed'
  | 'citation'
  | 'semantic'
  | 'temporal'
  | 'backfill_semantic'
  | 'backfill_temporal';

export type SelectedPaper = SSPaper & {
  selection_reason: SelectionReason;
  sim_to_seed?: number;
  temporal_score?: number;
};

type SelectionConfig = {
  citationTopK: number;
  semanticTopK: number;
  temporalTopK: number;
  semanticThreshold: number;
  temporalThreshold: number;
  keywordQueries: string[];
  keywordLimitPerQuery: number;
  candidatePoolMax: number;
  embeddingsModel: string;
  resolveArxivByTitle: boolean;
  arxivTitleThreshold: number;
  seedSearchLimit: number;
};

export const defaultSelectionConfig: SelectionConfig = {
  citationTopK: 20,
  semanticTopK: 15,
  temporalTopK: 5,
  semanticThreshold: 0.7,
  temporalThreshold: 0.6,
  keywordQueries: [
    'Gaussian Splatting',
    '3D Gaussian Splatting',
    'splatting radiance field',
    'point-based radiance fields',
  ],
  keywordLimitPerQuery: 60,
  candidatePoolMax: 300,
  embeddingsModel: 'gemini-embedding-001',
  resolveArxivByTitle: true,
  arxivTitleThreshold: 0.6,
  seedSearchLimit: 20,
};

function yearWeight(year?: number): number {
  if (year === 2025) return 1.0;
  if (year === 2024) return 0.8;
  return 0.0;
}

function isPaperUsable(p: SSPaper): boolean {
  return Boolean(p.paperId && p.title && (p.abstract?.trim()?.length ?? 0) > 0 && p.year);
}

async function attachArxivId(p: SSPaper, cfg: SelectionConfig): Promise<string | null> {
  const direct = extractArxivId(p);
  if (direct) return direct;

  if (cfg.resolveArxivByTitle && p.title) {
    const id = await searchArxivByTitle(p.title);
    if (id) return id;
  }
  return null;
}

export async function selectCorpus(params: {
  seedTitle: string;
  ssApiKey?: string;
  googleApiKey: string;
  config?: Partial<SelectionConfig>;
}): Promise<{
  seed: SSPaper;
  selected: SelectedPaper[];
  debug: {
    candidateCount: number;
    citationCount: number;
    semanticCandidates: number;
    temporalCandidates: number;
  };
}> {
  const cfg: SelectionConfig = { ...defaultSelectionConfig, ...(params.config ?? {}) };
  const ss = new SemanticScholarClient(params.ssApiKey);
  const emb = new EmbeddingsClient(params.googleApiKey);
  const citationLimit = Number(process.env.SS_CITATION_LIMIT || '100');
  const referenceLimit = Number(process.env.SS_REFERENCE_LIMIT || '100');
  const keywordLimit = Number(process.env.SS_KEYWORD_LIMIT || `${cfg.keywordLimitPerQuery}`);

  console.log('[Selection] Searching for seed paper:', params.seedTitle);
  const seedMatches = await withRetry(() => {
    console.log('[Selection] Calling ss.searchPaperByTitle with limit:', cfg.seedSearchLimit);
    return ss.searchPaperByTitle(params.seedTitle, cfg.seedSearchLimit);
  });
  console.log('[Selection] Seed matches found:', seedMatches.length);
  if (seedMatches.length === 0) throw new Error('No seed paper matches found');
  const seed = seedMatches
    .filter(isPaperUsable)
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))[0];
  if (!seed) throw new Error('Seed paper missing required fields (title, abstract, year)');
  console.log('[Selection] Selected seed paper:', seed.paperId, seed.title);

  let citing: SSPaper[] = [];
  try {
    console.log('[Selection] Fetching citations for seed paper:', seed.paperId, 'limit:', citationLimit);
    const startTime = Date.now();
    citing = (await withRetry(() => ss.getCitations(seed.paperId, citationLimit, 0))).filter(isPaperUsable);
    const duration = Date.now() - startTime;
    console.log('[Selection] Citations fetched:', citing.length, `(took ${duration}ms)`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[Selection] citations fetch failed, continuing without citations', errMsg);
    if (err instanceof Error && err.stack) {
      console.warn('[Selection] Error stack:', err.stack);
    }
    citing = [];
  }

  let refs: SSPaper[] = [];
  try {
    console.log('[Selection] Fetching references for seed paper:', seed.paperId, 'limit:', referenceLimit);
    const startTime = Date.now();
    refs = (await withRetry(() => ss.getReferences(seed.paperId, referenceLimit, 0))).filter(isPaperUsable);
    const duration = Date.now() - startTime;
    console.log('[Selection] References fetched:', refs.length, `(took ${duration}ms)`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[Selection] references fetch failed, continuing without references', errMsg);
    if (err instanceof Error && err.stack) {
      console.warn('[Selection] Error stack:', err.stack);
    }
    refs = [];
  }

  const keywordResults: SSPaper[] = [];
  for (const q of cfg.keywordQueries) {
    try {
      console.log('[Selection] Keyword search:', q, 'limit:', keywordLimit);
      const results = (await withRetry(() => ss.keywordSearch(q, keywordLimit))).filter(isPaperUsable);
      console.log('[Selection] Keyword results for', q, ':', results.length);
      keywordResults.push(...results);
    } catch (err) {
      console.warn(`[Selection] keyword search failed for "${q}", continuing`, err);
    }
  }

  const byId = new Map<string, SSPaper>();
  const add = (p: SSPaper) => {
    if (!byId.has(p.paperId)) byId.set(p.paperId, p);
  };
  add(seed);
  citing.forEach(add);
  refs.forEach(add);
  keywordResults.forEach(add);

  const candidatesAll = Array.from(byId.values())
    .filter((p) => p.paperId !== seed.paperId)
    .slice(0, cfg.candidatePoolMax);

  const seedText = normalizeTextForEmbedding(seed.title, seed.abstract);
  const candidateTexts = candidatesAll.map((p) => normalizeTextForEmbedding(p.title, p.abstract));
  const [seedVec] = await emb.embedTexts([seedText], cfg.embeddingsModel);
  if (!seedVec) throw new Error('Seed embedding failed');
  const candVecs = await emb.embedTexts(candidateTexts, cfg.embeddingsModel);
  if (candVecs.length !== candidatesAll.length) throw new Error('Candidate embedding count mismatch');

  const withSim = candidatesAll.map((p, i) => ({
    paper: p,
    sim: cosineSimilarity(seedVec, candVecs[i]!),
  }));

  const topCiting = citing
    .slice()
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, cfg.citationTopK);

  const selectedMap = new Map<string, SelectedPaper>();
  selectedMap.set(seed.paperId, { ...seed, selection_reason: 'seed' });
  for (const p of topCiting) {
    selectedMap.set(p.paperId, { ...p, selection_reason: 'citation' });
  }

  const semanticPool = withSim
    .filter((x) => x.sim >= cfg.semanticThreshold)
    .sort((a, b) => b.sim - a.sim);
  // Select ALL papers that meet the semantic threshold (no limit)
  for (const x of semanticPool) {
    if (selectedMap.has(x.paper.paperId)) continue;
    selectedMap.set(x.paper.paperId, {
      ...x.paper,
      selection_reason: 'semantic',
      sim_to_seed: x.sim,
    });
  }

  const selectedIds = new Set(selectedMap.keys());
  const linkedIds = new Set<string>();
  for (const p of citing) linkedIds.add(p.paperId);
  for (const p of refs) linkedIds.add(p.paperId);
  const temporalCandidates = withSim
    .filter((x) => x.paper.year === 2024 || x.paper.year === 2025)
    .filter((x) => x.sim >= cfg.temporalThreshold || linkedIds.has(x.paper.paperId));
  const temporalRanked = temporalCandidates
    .map((x) => {
      const tw = yearWeight(x.paper.year);
      const temporalScore = 0.7 * x.sim + 0.3 * tw;
      return { ...x, temporalScore };
    })
    .sort((a, b) => b.temporalScore - a.temporalScore);

  let temporalPicked = 0;
  for (const x of temporalRanked) {
    if (temporalPicked >= cfg.temporalTopK) break;
    if (selectedIds.has(x.paper.paperId)) continue;
    selectedMap.set(x.paper.paperId, {
      ...x.paper,
      selection_reason: 'temporal',
      sim_to_seed: x.sim,
      temporal_score: x.temporalScore,
    });
    selectedIds.add(x.paper.paperId);
    temporalPicked++;
  }

  // No backfill needed since semantic selection is unlimited
  // All papers meeting thresholds are already selected

  const selected = Array.from(selectedMap.values());

  // Attempt to attach arXiv IDs where possible (normalize + title search fallback)
  const withArxivPromises = selected.map(async (p) => {
    const arxivId = await attachArxivId(p, cfg);
    return { ...p, arxivId };
  });
  const withArxiv = await Promise.all(withArxivPromises);

  return {
    seed,
    selected: withArxiv,
    debug: {
      candidateCount: candidatesAll.length,
      citationCount: citing.length,
      semanticCandidates: semanticPool.length,
      temporalCandidates: temporalCandidates.length,
    },
  };
}


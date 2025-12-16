import type { SSPaper } from './client';
import { SemanticScholarClient } from './client';
import { EmbeddingsClient } from '../../embeddings/embed';
import { cosineSimilarity, normalizeTextForEmbedding } from '../../embeddings/similarity';
import { withRetry } from '../../utils/retry';

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
};

function yearWeight(year?: number): number {
  if (year === 2025) return 1.0;
  if (year === 2024) return 0.8;
  return 0.0;
}

function isPaperUsable(p: SSPaper): boolean {
  return Boolean(p.paperId && p.title && (p.abstract?.trim()?.length ?? 0) > 0 && p.year);
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

  const seedMatches = await withRetry(() => ss.searchPaperByTitle(params.seedTitle, 8));
  if (seedMatches.length === 0) throw new Error('No seed paper matches found');
  const seed = seedMatches
    .filter(isPaperUsable)
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))[0];
  if (!seed) throw new Error('Seed paper missing required fields (title, abstract, year)');

  let citing: SSPaper[] = [];
  try {
    citing = (await withRetry(() => ss.getCitations(seed.paperId, citationLimit, 0))).filter(isPaperUsable);
  } catch (err) {
    console.warn('[Selection] citations fetch failed, continuing without citations', err);
    citing = [];
  }

  let refs: SSPaper[] = [];
  try {
    refs = (await withRetry(() => ss.getReferences(seed.paperId, referenceLimit, 0))).filter(isPaperUsable);
  } catch (err) {
    console.warn('[Selection] references fetch failed, continuing without references', err);
    refs = [];
  }

  const keywordResults: SSPaper[] = [];
  for (const q of cfg.keywordQueries) {
    try {
      const results = (await withRetry(() => ss.keywordSearch(q, keywordLimit))).filter(isPaperUsable);
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
  let semanticPicked = 0;
  for (const x of semanticPool) {
    if (semanticPicked >= cfg.semanticTopK) break;
    if (selectedMap.has(x.paper.paperId)) continue;
    selectedMap.set(x.paper.paperId, {
      ...x.paper,
      selection_reason: 'semantic',
      sim_to_seed: x.sim,
    });
    semanticPicked++;
  }

  const selectedIds = new Set(selectedMap.keys());
  const linkedIds = new Set<string>([...citing.map((p) => p.paperId), ...refs.map((p) => p.paperId)]);
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

  const desiredTotal = 1 + cfg.citationTopK + cfg.semanticTopK + cfg.temporalTopK;
  if (selectedMap.size < desiredTotal) {
    for (const x of semanticPool) {
      if (selectedMap.size >= desiredTotal) break;
      if (selectedMap.has(x.paper.paperId)) continue;
      selectedMap.set(x.paper.paperId, {
        ...x.paper,
        selection_reason: 'backfill_semantic',
        sim_to_seed: x.sim,
      });
    }

    if (selectedMap.size < desiredTotal) {
      for (const x of temporalRanked) {
        if (selectedMap.size >= desiredTotal) break;
        if (selectedMap.has(x.paper.paperId)) continue;
        selectedMap.set(x.paper.paperId, {
          ...x.paper,
          selection_reason: 'backfill_temporal',
          sim_to_seed: x.sim,
          temporal_score: x.temporalScore,
        });
      }
    }
  }

  const selected = Array.from(selectedMap.values());

  return {
    seed,
    selected,
    debug: {
      candidateCount: candidatesAll.length,
      citationCount: citing.length,
      semanticCandidates: semanticPool.length,
      temporalCandidates: temporalCandidates.length,
    },
  };
}


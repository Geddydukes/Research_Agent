import { ArxivClient, type ArxivPaper } from './client';
import { EmbeddingsClient } from '../../embeddings/embed';
import { cosineSimilarity, normalizeTextForEmbedding } from '../../embeddings/similarity';

type SelectionReason = 'seed' | 'semantic' | 'backfill_semantic';

export type ArxivSelectedPaper = ArxivPaper & {
  selection_reason: SelectionReason;
  sim_to_seed?: number;
};

type SelectionConfig = {
  semanticTopK: number;
  semanticThreshold: number;
  candidatePoolMax: number;
  embeddingsModel: string;
  searchMaxResults: number;
};

export const defaultArxivConfig: SelectionConfig = {
  semanticTopK: 15,
  semanticThreshold: 0.7,
  candidatePoolMax: 200,
  embeddingsModel: 'gemini-embedding-001',
  searchMaxResults: 60,
};

function isUsable(p: ArxivPaper): boolean {
  return Boolean(p.paperId && p.title && (p.abstract?.trim()?.length ?? 0) > 0 && p.year);
}

export async function selectCorpusArxiv(params: {
  seedQuery: string;
  googleApiKey: string;
  config?: Partial<SelectionConfig>;
}): Promise<{
  seed: ArxivPaper;
  selected: ArxivSelectedPaper[];
  debug: {
    candidateCount: number;
  };
}> {
  const cfg: SelectionConfig = { ...defaultArxivConfig, ...(params.config ?? {}) };
  const client = new ArxivClient();
  const emb = new EmbeddingsClient(params.googleApiKey);

  const results = (await client.search(params.seedQuery, cfg.searchMaxResults)).filter(isUsable);
  if (results.length === 0) throw new Error('No arXiv results found for seed query');

  const seed = results[0];
  const candidates = results.slice(1, cfg.candidatePoolMax);

  const seedText = normalizeTextForEmbedding(seed.title, seed.abstract);
  const candTexts = candidates.map((p) => normalizeTextForEmbedding(p.title, p.abstract));
  const [seedVec] = await emb.embedTexts([seedText], cfg.embeddingsModel);
  if (!seedVec) throw new Error('Seed embedding failed');
  const candVecs = await emb.embedTexts(candTexts, cfg.embeddingsModel);
  if (candVecs.length !== candidates.length) throw new Error('Candidate embedding count mismatch');

  const withSim = candidates.map((p, i) => ({
    paper: p,
    sim: cosineSimilarity(seedVec, candVecs[i]!),
  }));

  const selectedMap = new Map<string, ArxivSelectedPaper>();
  selectedMap.set(seed.paperId, { ...seed, selection_reason: 'seed' });

  const semanticPool = withSim
    .filter((x) => x.sim >= cfg.semanticThreshold)
    .sort((a, b) => b.sim - a.sim);

  let picked = 0;
  for (const x of semanticPool) {
    if (picked >= cfg.semanticTopK) break;
    if (selectedMap.has(x.paper.paperId)) continue;
    selectedMap.set(x.paper.paperId, {
      ...x.paper,
      selection_reason: 'semantic',
      sim_to_seed: x.sim,
    });
    picked++;
  }

  // Backfill semantic if below target
  if (selectedMap.size < 1 + cfg.semanticTopK) {
    for (const x of withSim) {
      if (selectedMap.size >= 1 + cfg.semanticTopK) break;
      if (selectedMap.has(x.paper.paperId)) continue;
      selectedMap.set(x.paper.paperId, {
        ...x.paper,
        selection_reason: 'backfill_semantic',
        sim_to_seed: x.sim,
      });
    }
  }

  const selected = Array.from(selectedMap.values());
  return {
    seed,
    selected,
    debug: {
      candidateCount: candidates.length,
    },
  };
}



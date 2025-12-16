import type { EmbeddingVector } from './embed';

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length) throw new Error('Embedding dimension mismatch');
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

export function normalizeTextForEmbedding(title: string, abstract?: string): string {
  const a = abstract?.trim() ?? '';
  return `${title.trim()}\n${a}`.trim();
}



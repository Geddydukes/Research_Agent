import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  buildCacheEntry,
  buildCacheKey,
  readCache,
  writeCache,
} from '../utils/cache';
import { limit } from '../utils/limiter';

export type EmbeddingVector = number[];

const EMBED_BATCH_SIZE = Number(process.env.EMBED_BATCH_SIZE || '32');

export class EmbeddingsClient {
  private ai: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenerativeAI(apiKey);
  }

  async embedTexts(texts: string[], model = 'gemini-embedding-001'): Promise<EmbeddingVector[]> {
    if (texts.length === 0) return [];

    const results: (EmbeddingVector | null)[] = new Array(texts.length).fill(null);
    const textToCacheKey: Map<string, string> = new Map();
    const textToInputHash: Map<string, string> = new Map();
    const textToIndex: Map<string, number[]> = new Map();

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]!;
      if (!textToCacheKey.has(text)) {
        const { key, inputHash } = buildCacheKey({
          agentName: 'Embedding',
          model,
          provider: 'gemini',
          promptVersion: 'v1',
          schemaVersion: 'v1',
          input: { text },
        });
        textToCacheKey.set(text, key);
        textToInputHash.set(text, inputHash);
      }

      if (!textToIndex.has(text)) {
        textToIndex.set(text, []);
      }
      textToIndex.get(text)!.push(i);
    }

    const uniqueTexts = Array.from(textToIndex.keys());
    const cacheResults = await Promise.all(
      uniqueTexts.map((text) => readCache<EmbeddingVector>(textToCacheKey.get(text)!))
    );

    for (let i = 0; i < uniqueTexts.length; i++) {
      const cached = cacheResults[i];
      if (cached) {
        const text = uniqueTexts[i]!;
        const indices = textToIndex.get(text)!;
        for (const idx of indices) {
          results[idx] = cached.value;
        }
      }
    }

    const uncachedTexts: Array<{ text: string; indices: number[]; key: string; inputHash: string }> = [];
    const seenUncached = new Set<string>();

    for (let i = 0; i < texts.length; i++) {
      if (results[i] === null) {
        const text = texts[i]!;
        if (!seenUncached.has(text)) {
          seenUncached.add(text);
          uncachedTexts.push({
            text,
            indices: textToIndex.get(text)!,
            key: textToCacheKey.get(text)!,
            inputHash: textToInputHash.get(text)!,
          });
        }
      }
    }

    const m = this.ai.getGenerativeModel({ model });

    for (let batchStart = 0; batchStart < uncachedTexts.length; batchStart += EMBED_BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + EMBED_BATCH_SIZE, uncachedTexts.length);
      const batch = uncachedTexts.slice(batchStart, batchEnd);

      const batchPromises = batch.map(async ({ text, key, inputHash }, batchIdx) => {

        const start = Date.now();
        const resp = await limit('gemini_embed', async () => {
          return m.embedContent({ content: { role: 'user', parts: [{ text }] } });
        });
        const vals = (resp.embedding?.values ?? []) as number[];
        const durationMs = Date.now() - start;

        const entry = buildCacheEntry(
          {
            agentName: 'Embedding',
            promptVersion: 'v1',
            schemaVersion: 'v1',
            provider: 'gemini',
            model,
            inputHash,
            durationMs,
            finishReason: undefined,
          },
          vals
        );
        await writeCache(key, entry);
        return { vals, batchIdx };
      });

      const batchResults = await Promise.all(batchPromises);

      for (const { vals, batchIdx } of batchResults) {
        const { indices } = batch[batchIdx]!;
        for (const idx of indices) {
          results[idx] = vals;
        }
      }
    }

    return results as EmbeddingVector[];
  }
}


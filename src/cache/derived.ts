import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { stableStringify } from '../utils/cache';

const DERIVED_CACHE_ROOT = path.resolve('.cache/derived');

type DerivedType = 'sections' | 'entities' | 'candidates' | 'relationship_candidates' | 'graph_snapshot';

interface CacheStats {
  hits: number;
  misses: number;
}

const cacheStats: Map<DerivedType, CacheStats> = new Map();

export function getCacheStats(): Record<string, { hits: number; misses: number }> {
  const result: Record<string, { hits: number; misses: number }> = {};
  for (const [type, stats] of cacheStats) {
    result[type] = { hits: stats.hits, misses: stats.misses };
  }
  return result;
}

export function resetCacheStats(): void {
  cacheStats.clear();
}

interface DerivedCacheEntry<T> {
  type: DerivedType;
  hash: string;
  schemaVersion: string;
  promptVersion: string;
  value: T;
  createdAt: string;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function computeDerivedHash(
  type: DerivedType,
  data: unknown,
  schemaVersion: string,
  promptVersion: string
): string {
  const payload = stableStringify({ type, data, schemaVersion, promptVersion });
  return sha256(payload);
}

async function ensureCacheDir(type: DerivedType): Promise<void> {
  const dir = path.join(DERIVED_CACHE_ROOT, type);
  await fs.mkdir(dir, { recursive: true });
}

export async function readDerivedCache<T>(
  type: DerivedType,
  hash: string
): Promise<T | null> {
  const filePath = path.join(DERIVED_CACHE_ROOT, type, `${hash}.json`);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const entry = JSON.parse(data) as DerivedCacheEntry<T>;
    
    if (!cacheStats.has(type)) {
      cacheStats.set(type, { hits: 0, misses: 0 });
    }
    cacheStats.get(type)!.hits++;
    
    return entry.value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (!cacheStats.has(type)) {
        cacheStats.set(type, { hits: 0, misses: 0 });
      }
      cacheStats.get(type)!.misses++;
      return null;
    }
    throw error;
  }
}

export async function writeDerivedCache<T>(
  type: DerivedType,
  hash: string,
  value: T,
  schemaVersion: string,
  promptVersion: string
): Promise<void> {
  await ensureCacheDir(type);
  const filePath = path.join(DERIVED_CACHE_ROOT, type, `${hash}.json`);
  const entry: DerivedCacheEntry<T> = {
    type,
    hash,
    schemaVersion,
    promptVersion,
    value,
    createdAt: new Date().toISOString(),
  };
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(entry), 'utf8');
  await fs.rename(tmpPath, filePath);
}

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

const CACHE_ROOT = path.resolve('.cache/agent_cache');

export interface CacheKeyParts {
  agentName: string;
  model: string;
  provider: string;
  promptVersion: string;
  schemaVersion: string;
  input: unknown;
}

export interface CacheMeta {
  createdAt: string;
  durationMs: number;
  agentName: string;
  promptVersion: string;
  schemaVersion: string;
  provider: string;
  model: string;
  inputHash: string;
  outputHash: string;
  finishReason?: string;
}

export interface CacheEntry<T> {
  meta: CacheMeta;
  value: T;
}

export function stableStringify(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return 'null';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const mapped = value.map((item) => stableStringify(item));
    return `[${mapped.join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && typeof v !== 'function' && typeof v !== 'symbol')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const mapped = entries.map(
    ([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`
  );
  return `{${mapped.join(',')}}`;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildCacheKey(parts: CacheKeyParts): {
  key: string;
  inputHash: string;
  canonicalInput: string;
} {
  const canonicalInput = stableStringify(parts.input);
  const inputHash = sha256(canonicalInput);
  const raw = [
    parts.provider,
    parts.model,
    parts.agentName,
    parts.promptVersion,
    parts.schemaVersion,
    inputHash,
  ].join('|');
  return {
    key: sha256(raw),
    inputHash,
    canonicalInput,
  };
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_ROOT, { recursive: true });
}

export async function readCache<T>(
  cacheKey: string
): Promise<CacheEntry<T> | null> {
  const filePath = path.join(CACHE_ROOT, `${cacheKey}.json`);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data) as CacheEntry<T>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeCache<T>(
  cacheKey: string,
  entry: CacheEntry<T>
): Promise<void> {
  await ensureCacheDir();
  const filePath = path.join(CACHE_ROOT, `${cacheKey}.json`);
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  const payload = JSON.stringify(entry);
  await fs.writeFile(tmpPath, payload, { encoding: 'utf8' });
  await fs.rename(tmpPath, filePath);
}

export function computeOutputHash(value: unknown): string {
  return sha256(stableStringify(value));
}

export function buildCacheEntry<T>(
  meta: Omit<CacheMeta, 'outputHash' | 'createdAt'>,
  value: T
): CacheEntry<T> {
  const outputHash = computeOutputHash(value);
  return {
    meta: {
      ...meta,
      outputHash,
      createdAt: new Date().toISOString(),
    },
    value,
  };
}

export const cachePaths = {
  root: CACHE_ROOT,
};

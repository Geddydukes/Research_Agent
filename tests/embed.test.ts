import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { EmbeddingsClient } from '../src/embeddings/embed';
import * as cache from '../src/utils/cache';
import { limit } from '../src/utils/limiter';

jest.mock('../src/utils/cache', () => ({
  buildCacheKey: jest.fn((parts: any) => ({
    key: `cache-key-${parts.input?.text || 'unknown'}`,
    inputHash: `hash-${parts.input?.text || 'unknown'}`,
  })),
  buildCacheEntry: jest.fn((meta: any, value: any) => ({ meta, value })),
  readCache: jest.fn(),
  writeCache: jest.fn(),
  stableStringify: jest.fn((v: any) => JSON.stringify(v)),
}));

jest.mock('../src/utils/limiter', () => ({
  limit: jest.fn(async (_lane: string, fn: () => Promise<any>) => fn()),
}));

describe('EmbeddingsClient batching', () => {
  let client: EmbeddingsClient;
  let mockModel: any;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new EmbeddingsClient('test-key');
    
    mockModel = {
      embedContent: jest.fn(),
    };
    
    (client as any).ai = {
      getGenerativeModel: jest.fn(() => mockModel),
    };

    (limit as jest.MockedFunction<typeof limit>).mockImplementation(async (_lane: string, fn: () => Promise<any>) => fn());
  });

  it('preserves order of results', async () => {
    const texts = ['text1', 'text2', 'text3'];
    
    (cache.readCache as jest.MockedFunction<typeof cache.readCache>).mockResolvedValue(null);
    
    mockModel.embedContent.mockResolvedValue({
      embedding: { values: [1, 2, 3] },
    });

    const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000000';
    const results = await client.embedTexts(texts, TEST_TENANT_ID);

    expect(results).toHaveLength(3);
    expect(mockModel.embedContent).toHaveBeenCalledTimes(3);
  });

  it('checks cache before calling provider', async () => {
    const texts = ['text1', 'text2'];
    
    const mockReadCache = cache.readCache as jest.MockedFunction<typeof cache.readCache>;
    mockReadCache.mockResolvedValueOnce(null);
    mockReadCache.mockResolvedValueOnce({ value: [9, 9, 9], meta: {} as any });

    mockModel.embedContent.mockResolvedValue({
      embedding: { values: [1, 2, 3] },
    });

    const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000000';
    const results = await client.embedTexts(texts, TEST_TENANT_ID);

    expect(results[0]).toEqual([1, 2, 3]);
    expect(results[1]).toEqual([9, 9, 9]);
    expect(mockModel.embedContent).toHaveBeenCalledTimes(1);
    expect(cache.readCache).toHaveBeenCalledTimes(2);
  });

  it('handles duplicate texts efficiently', async () => {
    const texts = ['text1', 'text1', 'text2'];
    
    (cache.readCache as jest.MockedFunction<typeof cache.readCache>).mockResolvedValue(null);
    
    mockModel.embedContent.mockResolvedValue({
      embedding: { values: [1, 2, 3] },
    });

    const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000000';
    const results = await client.embedTexts(texts, TEST_TENANT_ID);

    expect(results).toHaveLength(3);
    expect(mockModel.embedContent).toHaveBeenCalledTimes(2);
    expect(results[0]).toEqual(results[1]);
  });

  it('returns empty array for empty input', async () => {
    const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000000';
    const results = await client.embedTexts([], TEST_TENANT_ID);
    expect(results).toEqual([]);
    expect(mockModel.embedContent).not.toHaveBeenCalled();
  });
});

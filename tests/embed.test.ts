import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { EmbeddingsClient } from '../src/embeddings/embed';
import * as cache from '../src/utils/cache';
import { limit } from '../src/utils/limiter';

jest.mock('../src/utils/cache', () => ({
  buildCacheKey: jest.fn((parts) => ({
    key: `cache-key-${parts.input?.text || 'unknown'}`,
    inputHash: `hash-${parts.input?.text || 'unknown'}`,
  })),
  buildCacheEntry: jest.fn((meta, value) => ({ meta, value })),
  readCache: jest.fn(),
  writeCache: jest.fn(),
  stableStringify: jest.fn((v) => JSON.stringify(v)),
}));

jest.mock('../src/utils/limiter', () => ({
  limit: jest.fn(async (lane, fn) => fn()),
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

    (limit as jest.Mock).mockImplementation(async (lane, fn) => fn());
  });

  it('preserves order of results', async () => {
    const texts = ['text1', 'text2', 'text3'];
    
    (cache.readCache as jest.Mock).mockResolvedValue(null);
    
    mockModel.embedContent.mockResolvedValue({
      embedding: { values: [1, 2, 3] },
    });

    const results = await client.embedTexts(texts);

    expect(results).toHaveLength(3);
    expect(mockModel.embedContent).toHaveBeenCalledTimes(3);
  });

  it('checks cache before calling provider', async () => {
    const texts = ['text1', 'text2'];
    
    (cache.readCache as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ value: [9, 9, 9] });

    mockModel.embedContent.mockResolvedValue({
      embedding: { values: [1, 2, 3] },
    });

    const results = await client.embedTexts(texts);

    expect(results[0]).toEqual([1, 2, 3]);
    expect(results[1]).toEqual([9, 9, 9]);
    expect(mockModel.embedContent).toHaveBeenCalledTimes(1);
    expect(cache.readCache).toHaveBeenCalledTimes(2);
  });

  it('handles duplicate texts efficiently', async () => {
    const texts = ['text1', 'text1', 'text2'];
    
    (cache.readCache as jest.Mock).mockResolvedValue(null);
    
    mockModel.embedContent.mockResolvedValue({
      embedding: { values: [1, 2, 3] },
    });

    const results = await client.embedTexts(texts);

    expect(results).toHaveLength(3);
    expect(mockModel.embedContent).toHaveBeenCalledTimes(2);
    expect(results[0]).toEqual(results[1]);
  });

  it('returns empty array for empty input', async () => {
    const results = await client.embedTexts([]);
    expect(results).toEqual([]);
    expect(mockModel.embedContent).not.toHaveBeenCalled();
  });
});

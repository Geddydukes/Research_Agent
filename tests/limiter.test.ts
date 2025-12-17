import { describe, it, expect } from '@jest/globals';
import { limit } from '../src/utils/limiter';

describe('limiter', () => {
  it('enforces max concurrency per lane', async () => {
    const maxConcurrency = 2;
    const lane = 'gemini_llm' as const;
    const running = new Set<number>();
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 5 }, (_, i) =>
      limit(lane, async () => {
        running.add(i);
        maxConcurrent = Math.max(maxConcurrent, running.size);
        await new Promise((resolve) => setTimeout(resolve, 10));
        running.delete(i);
        return i;
      })
    );

    await Promise.all(tasks);

    expect(maxConcurrent).toBeLessThanOrEqual(maxConcurrency);
    expect(maxConcurrent).toBeGreaterThan(0);
  });
});

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestServerWithRealDb } from './utils/dbHelpers';

const describeDb = (globalThis as any).__SKIP_DB_TESTS__ ? describe.skip : describe;

describeDb('Stats API', () => {
  let server: any;
  let cleanup: () => Promise<void>;
  let testData: Awaited<ReturnType<typeof createTestServerWithRealDb>>['testData'];

  beforeEach(async () => {
    const setup = await createTestServerWithRealDb();
    server = setup.server;
    cleanup = setup.cleanup;
    testData = setup.testData;
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  describe('GET /api/stats', () => {
    it('should return overall statistics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.papers).toBeDefined();
      expect(body.data.nodes).toBeDefined();
      expect(body.data.edges).toBeDefined();
      expect(body.data.insights).toBeDefined();
    });
  });

  describe('GET /api/stats/papers/:paperId', () => {
    it('should return statistics for a paper', async () => {
      const testPaper = testData.papers[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/stats/papers/${testPaper.paper_id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.paper).toBeDefined();
      expect(typeof body.data.sections).toBe('number');
      expect(typeof body.data.nodes).toBe('number');
      expect(typeof body.data.edges).toBe('number');
    });

    it('should return 404 for non-existent paper', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/stats/papers/non-existent',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

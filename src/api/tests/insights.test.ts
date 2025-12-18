import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestServerWithRealDb } from './utils/dbHelpers';

describe('Insights API', () => {
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

  describe('GET /api/insights', () => {
    it('should return all insights with pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/insights',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.pagination).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/insights?page=1&limit=1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.pagination.page).toBe(1);
    });
  });

  describe('GET /api/insights/:insightId', () => {
    it('should return insight details', async () => {
      const testInsight = testData.insights[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/insights/${testInsight.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe(testInsight.id);
      expect(body.data.insight_type).toBeDefined();
    });

    it('should return 404 for non-existent insight', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/insights/999999',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INSIGHT_NOT_FOUND');
    });

    it('should reject invalid insight ID', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/insights/invalid',
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

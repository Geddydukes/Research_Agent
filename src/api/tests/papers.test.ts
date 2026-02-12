import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestServerWithRealDb } from './utils/dbHelpers';

const describeDb = (globalThis as any).__SKIP_DB_TESTS__ ? describe.skip : describe;

describeDb('Papers API', () => {
  let server: any;
  let cleanup: () => Promise<void>;
  let testData: Awaited<ReturnType<typeof createTestServerWithRealDb>>['testData'];

  beforeEach(async () => {
    try {
      const setup = await createTestServerWithRealDb();
      server = setup.server;
      cleanup = setup.cleanup;
      testData = setup.testData;
    } catch (error) {
      console.error('Failed to set up test server:', error);
      throw error;
    }
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  describe('GET /api/papers', () => {
    it('should return all papers with pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/papers',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.pagination).toBeDefined();
      // Should have at least our test papers
      expect(body.pagination.total).toBeGreaterThanOrEqual(testData.papers.length);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should support pagination parameters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/papers?page=1&limit=1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBe(1);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(1);
    });
  });

  describe('GET /api/papers/:paperId', () => {
    it('should return paper details', async () => {
      const testPaper = testData.papers[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/papers/${testPaper.paper_id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.paper_id).toBe(testPaper.paper_id);
      expect(body.data.title).toBe('Test Paper 1');
    });

    it('should return 404 for non-existent paper', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/papers/non-existent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('PAPER_NOT_FOUND');
    });
  });

  describe('GET /api/papers/:paperId/sections', () => {
    it('should return paper sections', async () => {
      const testPaper = testData.papers[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/papers/${testPaper.paper_id}/sections`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.data)).toBe(true);
      if (body.data.length > 0) {
        expect(body.data[0].paper_id).toBe(testPaper.paper_id);
      }
    });
  });

  describe('GET /api/papers/:paperId/nodes', () => {
    it('should return nodes for a paper', async () => {
      const testPaper = testData.papers[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/papers/${testPaper.paper_id}/nodes`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/papers/:paperId/edges', () => {
    it('should return edges for a paper', async () => {
      const testPaper = testData.papers[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/papers/${testPaper.paper_id}/edges`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
});

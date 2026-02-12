import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestServerWithRealDb } from './utils/dbHelpers';

const describeDb = (globalThis as any).__SKIP_DB_TESTS__ ? describe.skip : describe;

describeDb('Edges API', () => {
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

  describe('GET /api/edges', () => {
    it('should return all edges with pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/edges',
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
        url: '/api/edges?page=1&limit=1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(1);
    });
  });

  describe('GET /api/edges/:edgeId', () => {
    it('should return edge modal data', async () => {
      const testEdge = testData.edges[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/edges/${testEdge.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.edge).toBeDefined();
      expect(body.data.source_node).toBeDefined();
      expect(body.data.target_node).toBeDefined();
      expect(body.data.validation_status).toBeDefined();
      expect(body.data.inferred_insight_ids).toBeDefined();
      expect(Array.isArray(body.data.inferred_insight_ids)).toBe(true);
    });

    it('should return 404 for non-existent edge', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/edges/999999',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('EDGE_NOT_FOUND');
    });

    it('should reject invalid edge ID', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/edges/invalid',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_ID');
    });
  });

  describe('GET /api/edges/:edgeId/insights', () => {
    it('should return insights for an edge', async () => {
      const testEdge = testData.edges[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/edges/${testEdge.id}/insights`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return empty array if no insights', async () => {
      const testEdge = testData.edges[1];
      const response = await server.inject({
        method: 'GET',
        url: `/api/edges/${testEdge.id}/insights`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
});

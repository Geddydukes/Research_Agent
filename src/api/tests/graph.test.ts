import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestServerWithRealDb } from './utils/dbHelpers';

describe('Graph API', () => {
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

  describe('GET /api/graph/neighborhood', () => {
    it('should return neighborhood by nodeId', async () => {
      const testNode = testData.nodes[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/graph/neighborhood?nodeId=${testNode.id}&depth=1&maxNodes=100`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.nodes).toBeDefined();
      expect(body.data.edges).toBeDefined();
      expect(body.data.metadata).toBeDefined();
      expect(Array.isArray(body.data.nodes)).toBe(true);
      expect(Array.isArray(body.data.edges)).toBe(true);
    });

    it('should return neighborhood by paperId', async () => {
      const testPaper = testData.papers[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/graph/neighborhood?paperId=${testPaper.paper_id}&depth=1&maxNodes=100`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.nodes.length).toBeGreaterThan(0);
    });

    it('should require nodeId or paperId', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/graph/neighborhood',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('should respect maxNodes limit', async () => {
      const testNode = testData.nodes[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/graph/neighborhood?nodeId=${testNode.id}&maxNodes=1`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.nodes.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /api/graph/viewport', () => {
    it('should return viewport for a paper', async () => {
      const testPaper = testData.papers[0];
      const response = await server.inject({
        method: 'GET',
        url: `/api/graph/viewport?paperId=${testPaper.paper_id}&depth=1&maxNodes=100`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.nodes).toBeDefined();
      expect(body.data.edges).toBeDefined();
    });

    it('should require paperId', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/graph/viewport',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/graph/subgraph', () => {
    it('should return subgraph for selected papers', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/graph/subgraph',
        payload: {
          paperIds: testData.papers.map((p) => p.paper_id),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.nodes).toBeDefined();
      expect(body.data.edges).toBeDefined();
    });

    it('should require paperIds array', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/graph/subgraph',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/graph', () => {
    it('should return full graph with hard cap', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/graph?maxNodes=100',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.nodes.length).toBeLessThanOrEqual(100);
    });

    it('should enforce maxNodes limit', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/graph?maxNodes=10000',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.message).toContain('5000');
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestServerWithRealDb } from './utils/dbHelpers';

describe('Search API', () => {
  let server: any;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestServerWithRealDb();
    server = setup.server;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  describe('GET /api/search', () => {
    it('should require search query', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/search',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('should search papers and nodes by default', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/search?q=Test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });

    it('should support type filter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/search?q=Test&type=paper',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });

    it('should support limit parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/search?q=Test&limit=10',
      });

      expect(response.statusCode).toBe(200);
    });
  });
});

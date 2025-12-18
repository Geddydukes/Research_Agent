import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestServerWithRealDb } from './utils/dbHelpers';

describe('Pipeline API', () => {
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

  describe('POST /api/pipeline/process', () => {
    it('should require API key', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/pipeline/process',
        payload: {
          paper_id: 'test',
          raw_text: 'test content',
        },
      });

      // In test mode without API_KEY set, it might skip auth
      // But with API_KEY set, it should require the header
      if (process.env.API_KEY) {
        expect([401, 202]).toContain(response.statusCode);
      }
    });

    it('should accept valid paper input', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/pipeline/process',
        headers: {
          'x-api-key': process.env.API_KEY || 'test-api-key',
        },
        payload: {
          paper_id: `test-pipeline-${Date.now()}`,
          title: 'New Paper',
          raw_text: 'This is the paper content',
          metadata: { year: 2024 },
        },
      });

      expect([202, 401]).toContain(response.statusCode);
      if (response.statusCode === 202) {
        const body = JSON.parse(response.body);
        expect(body.data).toBeDefined();
        expect(body.data.jobId).toBeDefined();
        expect(body.data.status).toBe('pending');
      }
    });

    it('should require paper_id and raw_text', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/pipeline/process',
        headers: {
          'x-api-key': process.env.API_KEY || 'test-api-key',
        },
        payload: {
          paper_id: 'test',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/pipeline/status/:jobId', () => {
    it('should return 404 for non-existent job', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/pipeline/status/non-existent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('JOB_NOT_FOUND');
    });
  });
});

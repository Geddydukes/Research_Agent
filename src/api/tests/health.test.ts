import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestServerWithRealDb } from './utils/dbHelpers';

const describeDb = (globalThis as any).__SKIP_DB_TESTS__ ? describe.skip : describe;

describeDb('Health Check', () => {
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

  it('should return health status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});

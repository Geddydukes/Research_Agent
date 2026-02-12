import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StatsController } from '../controllers/statsController';
import { StatsService } from '../services/statsService';
import { createDatabaseClient } from '../../db/client';
import { requireTenant } from '../middleware';

export function registerStatsRoutes(fastify: FastifyInstance) {
  // GET /api/stats
  fastify.get('/api/stats', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const statsService = new StatsService(db);
    const controller = new StatsController(statsService);
    await controller.getStats(request as any, reply);
  });

  // GET /api/stats/papers/:paperId
  fastify.get('/api/stats/papers/:paperId', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const statsService = new StatsService(db);
    const controller = new StatsController(statsService);
    await controller.getPaperStats(request as any, reply);
  });
}

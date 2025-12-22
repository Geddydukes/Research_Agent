import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { InsightsController } from '../controllers/insightsController';
import { InsightsService } from '../services/insightsService';
import { createDatabaseClient } from '../../db/client';
import { requireTenant } from '../middleware';

export function registerInsightsRoutes(fastify: FastifyInstance) {
  // GET /api/insights
  fastify.get('/api/insights', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const insightsService = new InsightsService(db);
    const controller = new InsightsController(insightsService);
    await controller.getAll(request as any, reply);
  });

  // GET /api/insights/:insightId
  fastify.get('/api/insights/:insightId', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const insightsService = new InsightsService(db);
    const controller = new InsightsController(insightsService);
    await controller.getById(request as any, reply);
  });
}

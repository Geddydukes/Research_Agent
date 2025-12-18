import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { InsightsController } from '../controllers/insightsController';
import { InsightsService } from '../services/insightsService';
import type { DatabaseClient } from '../../db/client';

export function registerInsightsRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const insightsService = new InsightsService(db);
  const controller = new InsightsController(insightsService);

  // GET /api/insights
  fastify.get('/api/insights', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getAll(request as any, reply);
  });

  // GET /api/insights/:insightId
  fastify.get('/api/insights/:insightId', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getById(request as any, reply);
  });
}

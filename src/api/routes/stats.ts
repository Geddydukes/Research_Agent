import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StatsController } from '../controllers/statsController';
import { StatsService } from '../services/statsService';
import type { DatabaseClient } from '../../db/client';

export function registerStatsRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const statsService = new StatsService(db);
  const controller = new StatsController(statsService);

  // GET /api/stats
  fastify.get('/api/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getStats(request as any, reply);
  });

  // GET /api/stats/papers/:paperId
  fastify.get('/api/stats/papers/:paperId', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getPaperStats(request as any, reply);
  });
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EdgesController } from '../controllers/edgesController';
import { EdgesService } from '../services/edgesService';
import type { DatabaseClient } from '../../db/client';

export function registerEdgesRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const edgesService = new EdgesService(db);
  const controller = new EdgesController(edgesService);

  // GET /api/edges
  fastify.get('/api/edges', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getAll(request as any, reply);
  });

  // GET /api/edges/:edgeId - First class edge modal endpoint
  fastify.get('/api/edges/:edgeId', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getById(request as any, reply);
  });

  // GET /api/edges/:edgeId/insights
  fastify.get('/api/edges/:edgeId/insights', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getInsights(request as any, reply);
  });
}

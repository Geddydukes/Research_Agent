import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GraphController } from '../controllers/graphController';
import { GraphService } from '../services/graphService';
import type { DatabaseClient } from '../../db/client';

export function registerGraphRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const graphService = new GraphService(db);
  const controller = new GraphController(graphService);

  // GET /api/graph/neighborhood - Primary UI endpoint
  fastify.get('/api/graph/neighborhood', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getNeighborhood(request as any, reply);
  });

  // GET /api/graph/viewport
  fastify.get('/api/graph/viewport', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getViewport(request as any, reply);
  });

  // POST /api/graph/subgraph
  fastify.post('/api/graph/subgraph', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getSubgraph(request as any, reply);
  });

  // GET /api/graph - Debug endpoint with hard cap
  fastify.get('/api/graph', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getFullGraph(request as any, reply);
  });

  // GET /api/graphreview - Get review items (flagged and rejected)
  fastify.get('/api/graphreview', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getReviewGraph(request as any, reply);
  });
}

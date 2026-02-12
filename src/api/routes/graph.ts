import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GraphController } from '../controllers/graphController';
import { GraphService } from '../services/graphService';
import { createDatabaseClient } from '../../db/client';
import { requireTenant } from '../middleware';

export function registerGraphRoutes(fastify: FastifyInstance) {
  // GET /api/graph/neighborhood - Primary UI endpoint
  fastify.get('/api/graph/neighborhood', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const graphService = new GraphService(db);
    const controller = new GraphController(graphService);
    await controller.getNeighborhood(request as any, reply);
  });

  // GET /api/graph/viewport
  fastify.get('/api/graph/viewport', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const graphService = new GraphService(db);
    const controller = new GraphController(graphService);
    await controller.getViewport(request as any, reply);
  });

  // POST /api/graph/subgraph
  fastify.post('/api/graph/subgraph', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const graphService = new GraphService(db);
    const controller = new GraphController(graphService);
    await controller.getSubgraph(request as any, reply);
  });

  // GET /api/graph - Debug endpoint with hard cap
  fastify.get('/api/graph', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const graphService = new GraphService(db);
    const controller = new GraphController(graphService);
    await controller.getFullGraph(request as any, reply);
  });

  // GET /api/graphreview - Get review items (flagged and rejected)
  fastify.get('/api/graphreview', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const graphService = new GraphService(db);
    const controller = new GraphController(graphService);
    await controller.getReviewGraph(request as any, reply);
  });
}

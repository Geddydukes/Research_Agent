import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EdgesController } from '../controllers/edgesController';
import { EdgesService } from '../services/edgesService';
import { createDatabaseClient } from '../../db/client';
import { requireTenant } from '../middleware';

export function registerEdgesRoutes(fastify: FastifyInstance) {
  // GET /api/edges
  fastify.get('/api/edges', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const edgesService = new EdgesService(db);
    const controller = new EdgesController(edgesService);
    await controller.getAll(request as any, reply);
  });

  // GET /api/edges/:edgeId - First class edge modal endpoint
  fastify.get('/api/edges/:edgeId', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const edgesService = new EdgesService(db);
    const controller = new EdgesController(edgesService);
    await controller.getById(request as any, reply);
  });

  // GET /api/edges/:edgeId/insights
  fastify.get('/api/edges/:edgeId/insights', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const edgesService = new EdgesService(db);
    const controller = new EdgesController(edgesService);
    await controller.getInsights(request as any, reply);
  });
}

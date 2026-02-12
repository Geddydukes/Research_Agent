import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { NodesController } from '../controllers/nodesController';
import { NodesService } from '../services/nodesService';
import { createDatabaseClient } from '../../db/client';
import { requireTenant } from '../middleware';

export function registerNodesRoutes(fastify: FastifyInstance) {
  // GET /api/nodes/:nodeId/papers - Get all papers that mention a node
  fastify.get('/api/nodes/:nodeId/papers', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const nodesService = new NodesService(db);
    const controller = new NodesController(nodesService);
    await controller.getPapers(request as any, reply);
  });
}

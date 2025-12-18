import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { NodesController } from '../controllers/nodesController';
import { NodesService } from '../services/nodesService';
import type { DatabaseClient } from '../../db/client';

export function registerNodesRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const nodesService = new NodesService(db);
  const controller = new NodesController(nodesService);

  // GET /api/nodes/:nodeId/papers - Get all papers that mention a node
  fastify.get('/api/nodes/:nodeId/papers', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getPapers(request as any, reply);
  });
}

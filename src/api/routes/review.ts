import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createDatabaseClient } from '../../db/client';
import { requireTenant, requireTenantWriteAccess, requireUser } from '../middleware';

interface ReviewUpdateBody {
  items: Array<{
    id: number;
    status: 'approved' | 'flagged' | 'rejected';
    reason?: string;
    adjusted_confidence?: number;
  }>;
}

export function registerReviewRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/review/nodes',
    { preHandler: [requireUser, requireTenant, requireTenantWriteAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = request.tenantId!;
      const body = (request as any).body as ReviewUpdateBody;
      if (!body?.items?.length) {
        return reply.status(400).send({ error: 'No review items provided' });
      }

      const db = createDatabaseClient(tenantId);
      await db.updateNodesReviewStatus(
        body.items.map((item) => ({
          nodeId: item.id,
          reviewStatus: item.status,
          reviewReasons: item.reason,
          adjustedConfidence: item.adjusted_confidence,
        }))
      );

      reply.send({ data: { updated: body.items.length } });
    }
  );

  fastify.post(
    '/api/review/edges',
    { preHandler: [requireUser, requireTenant, requireTenantWriteAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = request.tenantId!;
      const body = (request as any).body as ReviewUpdateBody;
      if (!body?.items?.length) {
        return reply.status(400).send({ error: 'No review items provided' });
      }

      const db = createDatabaseClient(tenantId);
      await db.updateEdgesReviewStatus(
        body.items.map((item) => ({
          edgeId: item.id,
          reviewStatus: item.status,
          reviewReasons: item.reason,
        }))
      );

      reply.send({ data: { updated: body.items.length } });
    }
  );
}

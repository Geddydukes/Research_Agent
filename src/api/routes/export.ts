import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ExportController } from '../controllers/exportController';
import { requireTenant } from '../middleware';

export function registerExportRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/export', { preHandler: requireTenant }, async (request: FastifyRequest, reply: FastifyReply) => {
    const controller = new ExportController();
    await controller.export(request as any, reply);
  });
}

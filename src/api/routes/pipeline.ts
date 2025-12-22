import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PipelineController } from '../controllers/pipelineController';
import { requireApiKey, requireTenant } from '../middleware';

export function registerPipelineRoutes(fastify: FastifyInstance) {
  const controller = new PipelineController();

  // POST /api/pipeline/process - Requires API key and tenant
  fastify.post(
    '/api/pipeline/process',
    {
      preHandler: [requireApiKey, requireTenant],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await controller.process(request as any, reply);
    }
  );

  // GET /api/pipeline/status/:jobId - Requires tenant
  fastify.get('/api/pipeline/status/:jobId', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getStatus(request as any, reply);
  });
}

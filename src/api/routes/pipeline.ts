import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PipelineController } from '../controllers/pipelineController';
import { requireApiKey } from '../middleware/auth';

export function registerPipelineRoutes(fastify: FastifyInstance) {
  const controller = new PipelineController();

  // POST /api/pipeline/process - Requires API key
  fastify.post(
    '/api/pipeline/process',
    {
      preHandler: requireApiKey,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await controller.process(request as any, reply);
    }
  );

  // GET /api/pipeline/status/:jobId
  fastify.get('/api/pipeline/status/:jobId', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getStatus(request as any, reply);
  });
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PipelineController } from '../controllers/pipelineController';
import { requireTenant, requireTenantWriteAccess, requireUser } from '../middleware';

export function registerPipelineRoutes(fastify: FastifyInstance) {
  const controller = new PipelineController();

  // POST /api/pipeline/process - Requires auth and tenant
  fastify.post(
    '/api/pipeline/process',
    {
      preHandler: [requireUser, requireTenant, requireTenantWriteAccess],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await controller.process(request as any, reply);
    }
  );

  // POST /api/pipeline/process-file - Requires auth and tenant
  fastify.post(
    '/api/pipeline/process-file',
    {
      preHandler: [requireUser, requireTenant, requireTenantWriteAccess],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await controller.processFile(request as any, reply);
    }
  );

  // POST /api/pipeline/process-url - Requires auth and tenant
  fastify.post(
    '/api/pipeline/process-url',
    {
      preHandler: [requireUser, requireTenant, requireTenantWriteAccess],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await controller.processUrl(request as any, reply);
    }
  );

  // GET /api/pipeline/status/:jobId - Requires tenant
  fastify.get('/api/pipeline/status/:jobId', {
    preHandler: [requireUser, requireTenant],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getStatus(request as any, reply);
  });

  // GET /api/pipeline/jobs - Requires tenant
  fastify.get('/api/pipeline/jobs', {
    preHandler: [requireUser, requireTenant],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.list(request as any, reply);
  });
}

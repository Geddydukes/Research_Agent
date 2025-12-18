import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PapersController } from '../controllers/papersController';
import { PapersService } from '../services/papersService';
import type { DatabaseClient } from '../../db/client';

export function registerPapersRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const papersService = new PapersService(db);
  const controller = new PapersController(papersService);

  // GET /api/papers
  fastify.get('/api/papers', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getAll(request as any, reply);
  });

  // GET /api/papers/:paperId
  fastify.get('/api/papers/:paperId', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getById(request as any, reply);
  });

  // GET /api/papers/:paperId/sections
  fastify.get('/api/papers/:paperId/sections', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getSections(request as any, reply);
  });

  // GET /api/papers/:paperId/nodes
  fastify.get('/api/papers/:paperId/nodes', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getNodes(request as any, reply);
  });

  // GET /api/papers/:paperId/edges
  fastify.get('/api/papers/:paperId/edges', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getEdges(request as any, reply);
  });
}

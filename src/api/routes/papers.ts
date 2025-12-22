import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PapersController } from '../controllers/papersController';
import { PapersService } from '../services/papersService';
import { createDatabaseClient } from '../../db/client';
import { requireTenant } from '../middleware';

export function registerPapersRoutes(fastify: FastifyInstance) {
  // GET /api/papers
  fastify.get('/api/papers', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const papersService = new PapersService(db);
    const controller = new PapersController(papersService);
    await controller.getAll(request as any, reply);
  });

  // GET /api/papers/:paperId
  fastify.get('/api/papers/:paperId', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const papersService = new PapersService(db);
    const controller = new PapersController(papersService);
    await controller.getById(request as any, reply);
  });

  // GET /api/papers/:paperId/sections
  fastify.get('/api/papers/:paperId/sections', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const papersService = new PapersService(db);
    const controller = new PapersController(papersService);
    await controller.getSections(request as any, reply);
  });

  // GET /api/papers/:paperId/nodes
  fastify.get('/api/papers/:paperId/nodes', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const papersService = new PapersService(db);
    const controller = new PapersController(papersService);
    await controller.getNodes(request as any, reply);
  });

  // GET /api/papers/:paperId/edges
  fastify.get('/api/papers/:paperId/edges', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const papersService = new PapersService(db);
    const controller = new PapersController(papersService);
    await controller.getEdges(request as any, reply);
  });
}

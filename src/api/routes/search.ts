import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SearchController } from '../controllers/searchController';
import { SearchService } from '../services/searchService';
import { createDatabaseClient } from '../../db/client';
import { requireTenant } from '../middleware';

export function registerSearchRoutes(fastify: FastifyInstance) {
  // GET /api/search
  fastify.get('/api/search', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const searchService = new SearchService(db);
    const controller = new SearchController(searchService);
    await controller.search(request as any, reply);
  });

  // GET /api/search/semantic
  fastify.get('/api/search/semantic', {
    preHandler: requireTenant,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const searchService = new SearchService(db);
    const controller = new SearchController(searchService);
    await controller.searchSemantic(request as any, reply);
  });
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SearchController } from '../controllers/searchController';
import { SearchService } from '../services/searchService';
import type { DatabaseClient } from '../../db/client';

export function registerSearchRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const searchService = new SearchService(db);
  const controller = new SearchController(searchService);

  // GET /api/search
  fastify.get('/api/search', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.search(request as any, reply);
  });
}

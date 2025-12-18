import type { FastifyRequest, FastifyReply } from 'fastify';
import { SearchService } from '../services/searchService';
import { createError } from '../middleware/errorHandler';

interface SearchQuerystring {
  q: string;
  type?: 'paper' | 'node';
  limit?: string;
}

export class SearchController {
  constructor(private searchService: SearchService) {}

  async search(
    request: FastifyRequest<{ Querystring: SearchQuerystring }>,
    reply: FastifyReply
  ) {
    const { q, type, limit } = request.query;

    if (!q) {
      throw createError('Search query (q) is required', 400);
    }

    const params = {
      q,
      type,
      limit: limit ? parseInt(limit, 10) : undefined,
    };

    const results = await this.searchService.search(params);
    reply.send({ data: results });
  }
}

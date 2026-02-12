import type { FastifyRequest, FastifyReply } from 'fastify';
import { SearchService } from '../services/searchService';
import { createError } from '../middleware/errorHandler';
import { ArxivClient } from '../../ingest/arxiv/client';

interface SearchQuerystring {
  q: string;
  type?: 'paper' | 'node';
  limit?: string;
}

interface ArxivSearchQuerystring {
  q: string;
  limit?: string;
}

interface SemanticSearchQuerystring {
  q: string;
  limit?: string;
  threshold?: string;
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

  async searchSemantic(
    request: FastifyRequest<{ Querystring: SemanticSearchQuerystring }>,
    reply: FastifyReply
  ) {
    const { q, limit, threshold } = request.query;

    if (!q) {
      throw createError('Search query (q) is required', 400);
    }

    const params = {
      q,
      limit: limit ? parseInt(limit, 10) : undefined,
      threshold: threshold ? parseFloat(threshold) : undefined,
    };

    // Validate threshold if provided
    if (params.threshold !== undefined && (isNaN(params.threshold) || params.threshold < 0 || params.threshold > 1)) {
      throw createError('Threshold must be a number between 0 and 1', 400, 'INVALID_THRESHOLD');
    }

    // Validate limit if provided
    if (params.limit !== undefined && (isNaN(params.limit) || params.limit < 1)) {
      throw createError('Limit must be a positive number', 400, 'INVALID_LIMIT');
    }

    const results = await this.searchService.searchSemantic(params);
    reply.send({
      data: {
        papers: results,
        query: q,
        limit: params.limit || 20,
        threshold: params.threshold || 0.0,
        count: results.length,
      },
    });
  }

  async searchArxiv(
    request: FastifyRequest<{ Querystring: ArxivSearchQuerystring }>,
    reply: FastifyReply
  ) {
    const { q, limit } = request.query;

    if (!q || typeof q !== 'string' || !q.trim()) {
      throw createError('Search query (q) is required', 400);
    }

    const maxResults = limit ? Math.min(Math.max(1, parseInt(limit, 10)), 40) : 20;
    if (isNaN(maxResults)) {
      throw createError('Limit must be a number', 400, 'INVALID_LIMIT');
    }

    const arxiv = new ArxivClient();
    const papers = await arxiv.search(q.trim(), maxResults);
    reply.send({ data: papers });
  }
}

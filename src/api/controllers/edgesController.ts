import type { FastifyRequest, FastifyReply } from 'fastify';
import { EdgesService } from '../services/edgesService';
import { createError } from '../middleware/errorHandler';
import type { PaginationParams } from '../types/api';

interface EdgesQuerystring {
  page?: string;
  limit?: string;
}

interface EdgeParams {
  edgeId: string;
}

export class EdgesController {
  constructor(private edgesService: EdgesService) {}

  async getAll(
    request: FastifyRequest<{ Querystring: EdgesQuerystring }>,
    reply: FastifyReply
  ) {
    const params: PaginationParams = {
      page: request.query.page ? parseInt(request.query.page, 10) : undefined,
      limit: request.query.limit
        ? parseInt(request.query.limit, 10)
        : undefined,
    };

    const result = await this.edgesService.getAllEdges(params);
    reply.send(result);
  }

  async getById(
    request: FastifyRequest<{ Params: EdgeParams }>,
    reply: FastifyReply
  ) {
    const { edgeId } = request.params;
    const id = parseInt(edgeId, 10);

    if (isNaN(id)) {
      throw createError('Invalid edge ID', 400, 'INVALID_ID');
    }

    const modal = await this.edgesService.getEdgeModal(id);

    if (!modal) {
      throw createError('Edge not found', 404, 'EDGE_NOT_FOUND');
    }

    reply.send({ data: modal });
  }

  async getInsights(
    request: FastifyRequest<{ Params: EdgeParams }>,
    reply: FastifyReply
  ) {
    const { edgeId } = request.params;
    const id = parseInt(edgeId, 10);

    if (isNaN(id)) {
      throw createError('Invalid edge ID', 400, 'INVALID_ID');
    }

    const insights = await this.edgesService.getEdgeInsights(id);
    reply.send({ data: insights });
  }
}

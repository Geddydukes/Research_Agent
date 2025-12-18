import type { FastifyRequest, FastifyReply } from 'fastify';
import { InsightsService } from '../services/insightsService';
import { createError } from '../middleware/errorHandler';
import type { PaginationParams } from '../types/api';

interface InsightsQuerystring {
  page?: string;
  limit?: string;
}

interface InsightParams {
  insightId: string;
}

export class InsightsController {
  constructor(private insightsService: InsightsService) {}

  async getAll(
    request: FastifyRequest<{ Querystring: InsightsQuerystring }>,
    reply: FastifyReply
  ) {
    const params: PaginationParams = {
      page: request.query.page ? parseInt(request.query.page, 10) : undefined,
      limit: request.query.limit
        ? parseInt(request.query.limit, 10)
        : undefined,
    };

    const result = await this.insightsService.getAllInsights(params);
    reply.send(result);
  }

  async getById(
    request: FastifyRequest<{ Params: InsightParams }>,
    reply: FastifyReply
  ) {
    const { insightId } = request.params;
    const id = parseInt(insightId, 10);

    if (isNaN(id)) {
      throw createError('Invalid insight ID', 400, 'INVALID_ID');
    }

    const insight = await this.insightsService.getInsightById(id);

    if (!insight) {
      throw createError('Insight not found', 404, 'INSIGHT_NOT_FOUND');
    }

    reply.send({ data: insight });
  }
}

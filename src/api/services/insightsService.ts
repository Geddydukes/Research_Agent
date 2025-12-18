import type { DatabaseClient, InferredInsight } from '../../db/client';
import type { PaginationParams, PaginatedResponse } from '../types/api';

export class InsightsService {
  constructor(private db: DatabaseClient) {}

  async getAllInsights(
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<InferredInsight>> {
    const page = params.page || 1;
    const limit = params.limit || 50;

    const { data, count } = await this.db.getAllInsights({ page, limit });

    const total = count;
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getInsightById(insightId: number): Promise<InferredInsight | null> {
    return this.db.getInsightById(insightId);
  }
}

import type { DatabaseClient, Paper, PaperSection, Node, Edge } from '../../db/client';
import type { PaginationParams, PaginatedResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';

export class PapersService {
  constructor(private db: DatabaseClient) {}

  async getAllPapers(
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<Paper>> {
    const page = params.page || 1;
    const limit = params.limit || 50;

    const { data, count } = await this.db.getAllPapers({ page, limit });

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

  async getPaperById(paperId: string): Promise<Paper | null> {
    // Check if db has getPaperById method (for mocks)
    if (typeof (this.db as any).getPaperById === 'function') {
      return (this.db as any).getPaperById(paperId);
    }

    try {
      const { data, error } = await (this.db as any).client
        .from('papers')
        .select('*')
        .eq('tenant_id', this.db.tenantId)
        .eq('paper_id', paperId)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw createError(`Failed to get paper: ${error.message}`, 500);
      }

      return data as Paper | null;
    } catch (error) {
      throw createError(
        `Failed to get paper: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async getPaperSections(paperId: string): Promise<PaperSection[]> {
    return this.db.getPaperSections(paperId);
  }

  async getPaperNodes(paperId: string): Promise<Node[]> {
    // Return only approved nodes for consistency with graph endpoints
    return this.db.getNodesForPaper(paperId, 'approved');
  }

  async getPaperEdges(paperId: string): Promise<Edge[]> {
    // Return only approved edges for consistency with graph endpoints
    return this.db.getEdgesForPaper(paperId, 'approved');
  }
}

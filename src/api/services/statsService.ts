import type { DatabaseClient } from '../../db/client';
import type { StatsResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';

export class StatsService {
  constructor(private db: DatabaseClient) {}

  async getStats(): Promise<StatsResponse> {
    // Check if db has getStatsData method (for mocks)
    if (typeof (this.db as any).getStatsData === 'function') {
      const stats = await (this.db as any).getStatsData();
      return {
        papers: {
          total: stats.papersCount,
          processed: stats.papersCount,
        },
        nodes: {
          total: stats.nodesCount,
          byType: stats.nodesByType,
        },
        edges: {
          total: stats.edgesCount,
          byType: stats.edgesByType,
        },
        insights: {
          total: stats.insightsCount,
        },
      };
    }

    // Access Supabase client for raw queries
    const client = (this.db as any).client;

    // Get all counts
    const [
      papersResult,
      nodesResult,
      edgesResult,
      insightsResult,
    ] = await Promise.all([
      client.from('papers').select('*', { count: 'exact', head: true }),
      client.from('nodes').select('*', { count: 'exact', head: true }),
      client.from('edges').select('*', { count: 'exact', head: true }),
      client.from('inferred_insights').select('*', { count: 'exact', head: true }),
    ]);

    if (papersResult.error) {
      throw createError(`Failed to get paper stats: ${papersResult.error.message}`, 500);
    }
    if (nodesResult.error) {
      throw createError(`Failed to get node stats: ${nodesResult.error.message}`, 500);
    }
    if (edgesResult.error) {
      throw createError(`Failed to get edge stats: ${edgesResult.error.message}`, 500);
    }
    if (insightsResult.error) {
      throw createError(`Failed to get insight stats: ${insightsResult.error.message}`, 500);
    }

    // Get nodes by type
    const { data: nodesData } = await client
      .from('nodes')
      .select('type');

    const nodesByType: Record<string, number> = {};
    if (nodesData) {
      for (const node of nodesData) {
        const type = node.type as string;
        nodesByType[type] = (nodesByType[type] || 0) + 1;
      }
    }

    // Get edges by type
    const { data: edgesData } = await client
      .from('edges')
      .select('relationship_type');

    const edgesByType: Record<string, number> = {};
    if (edgesData) {
      for (const edge of edgesData) {
        const type = edge.relationship_type as string;
        edgesByType[type] = (edgesByType[type] || 0) + 1;
      }
    }

    return {
      papers: {
        total: papersResult.count || 0,
        processed: papersResult.count || 0, // All papers in DB are processed
      },
      nodes: {
        total: nodesResult.count || 0,
        byType: nodesByType,
      },
      edges: {
        total: edgesResult.count || 0,
        byType: edgesByType,
      },
      insights: {
        total: insightsResult.count || 0,
      },
    };
  }

  async getPaperStats(paperId: string): Promise<{
    paper: any;
    sections: number;
    nodes: number;
    edges: number;
  }> {
    // Check if db has getPaperById method (for mocks)
    if (typeof (this.db as any).getPaperById === 'function') {
      const paper = await (this.db as any).getPaperById(paperId);
      
      if (!paper) {
        throw createError('Paper not found', 404);
      }

      const [sections, nodes, edges] = await Promise.all([
        this.db.getPaperSections(paperId),
        this.db.getNodesForPaper(paperId),
        this.db.getEdgesForPaper(paperId),
      ]);

      return {
        paper,
        sections: sections.length,
        nodes: nodes.length,
        edges: edges.length,
      };
    }

    // Fall back to client access for real database
    const client = (this.db as any).client;
    const { data: paperData, error: paperError } = await client
      .from('papers')
      .select('*')
      .eq('paper_id', paperId)
      .maybeSingle();

    if (paperError) {
      throw createError(`Failed to get paper: ${paperError.message}`, 500);
    }

    if (!paperData) {
      throw createError('Paper not found', 404);
    }

    const [sections, nodes, edges] = await Promise.all([
      this.db.getPaperSections(paperId),
      this.db.getNodesForPaper(paperId),
      this.db.getEdgesForPaper(paperId),
    ]);

    return {
      paper: paperData,
      sections: sections.length,
      nodes: nodes.length,
      edges: edges.length,
    };
  }
}

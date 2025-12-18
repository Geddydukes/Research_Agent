import type { DatabaseClient, Paper, Node } from '../../db/client';
import type { SearchParams } from '../types/api';
import { createError } from '../middleware/errorHandler';

export class SearchService {
  constructor(private db: DatabaseClient) {}

  async search(params: SearchParams): Promise<{
    papers?: Paper[];
    nodes?: Node[];
  }> {
    const { q, type, limit = 20 } = params;

    if (!q || q.trim().length === 0) {
      throw createError('Search query is required', 400);
    }

    const searchLimit = Math.min(limit, 100);
    const results: { papers?: Paper[]; nodes?: Node[] } = {};

    if (!type || type === 'paper') {
      results.papers = await this.searchPapers(q, searchLimit);
    }

    if (!type || type === 'node') {
      results.nodes = await this.searchNodes(q, searchLimit);
    }

    return results;
  }

  private async searchPapers(query: string, limit: number): Promise<Paper[]> {
    // Check if db has searchPapers method (for mocks)
    if (typeof (this.db as any).searchPapers === 'function') {
      return (this.db as any).searchPapers(query, limit);
    }

    const searchTerm = `%${query}%`;
    const client = (this.db as any).client;

    const { data, error } = await client
      .from('papers')
      .select('*')
      .or(`title.ilike.${searchTerm},abstract.ilike.${searchTerm},paper_id.ilike.${searchTerm}`)
      .limit(limit);

    if (error) {
      throw createError(`Failed to search papers: ${error.message}`, 500);
    }

    return (data || []) as Paper[];
  }

  private async searchNodes(query: string, limit: number): Promise<Node[]> {
    // Check if db has searchNodes method (for mocks)
    if (typeof (this.db as any).searchNodes === 'function') {
      return (this.db as any).searchNodes(query, limit);
    }

    const searchTerm = `%${query}%`;

    const { data, error } = await (this.db as any).client
      .from('nodes')
      .select('*')
      .ilike('canonical_name', searchTerm)
      .limit(limit);

    if (error) {
      throw createError(`Failed to search nodes: ${error.message}`, 500);
    }

    return (data || []) as Node[];
  }
}

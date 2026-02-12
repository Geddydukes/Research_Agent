import type { DatabaseClient, Paper, Node } from '../../db/client';
import type { SearchParams } from '../types/api';
import { createError } from '../middleware/errorHandler';
import { EmbeddingsClient } from '../../embeddings/embed';
import { normalizeTextForEmbedding } from '../../embeddings/similarity';

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

    const searchTerm = `%${query.trim().slice(0, 256)}%`;
    const client = (this.db as any).client;

    const [titleResult, abstractResult, paperIdResult] = await Promise.all([
      client
        .from('papers')
        .select('*')
        .eq('tenant_id', this.db.tenantId)
        .ilike('title', searchTerm)
        .limit(limit),
      client
        .from('papers')
        .select('*')
        .eq('tenant_id', this.db.tenantId)
        .ilike('abstract', searchTerm)
        .limit(limit),
      client
        .from('papers')
        .select('*')
        .eq('tenant_id', this.db.tenantId)
        .ilike('paper_id', searchTerm)
        .limit(limit),
    ]);

    const error = titleResult.error || abstractResult.error || paperIdResult.error;
    if (error) {
      throw createError(`Failed to search papers: ${error.message}`, 500);
    }

    const merged = new Map<string, Paper>();
    for (const row of titleResult.data || []) {
      merged.set((row as Paper).paper_id, row as Paper);
      if (merged.size >= limit) break;
    }
    if (merged.size < limit) {
      for (const row of abstractResult.data || []) {
        merged.set((row as Paper).paper_id, row as Paper);
        if (merged.size >= limit) break;
      }
    }
    if (merged.size < limit) {
      for (const row of paperIdResult.data || []) {
        merged.set((row as Paper).paper_id, row as Paper);
        if (merged.size >= limit) break;
      }
    }

    return Array.from(merged.values()).slice(0, limit);
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
      .eq('tenant_id', this.db.tenantId)
      .ilike('canonical_name', searchTerm)
      .limit(limit);

    if (error) {
      throw createError(`Failed to search nodes: ${error.message}`, 500);
    }

    return (data || []) as Node[];
  }

  async searchSemantic(params: {
    q: string;
    limit?: number;
    threshold?: number;
  }): Promise<Array<{ paper: Paper; similarity: number }>> {
    const { q, limit = 20, threshold = 0.0 } = params;

    if (!q || q.trim().length === 0) {
      throw createError('Search query (q) is required', 400);
    }

    // Get Google API key from environment
    const googleApiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!googleApiKey) {
      throw createError('GOOGLE_API_KEY is required for semantic search', 500, 'MISSING_API_KEY');
    }

    // Normalize query text for embedding
    const queryText = normalizeTextForEmbedding(q, '');
    
    // Create embeddings client and embed the query
    const emb = new EmbeddingsClient(googleApiKey);
    const embeddingsModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
    
    let queryEmbedding: number[];
    try {
      const embeddings = await emb.embedTexts([queryText], this.db.tenantId, embeddingsModel);
      if (!embeddings[0]) {
        throw new Error('Failed to generate embedding for query');
      }
      queryEmbedding = embeddings[0];
    } catch (error) {
      throw createError(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'EMBEDDING_ERROR'
      );
    }

    // Find similar papers using the embedding
    const searchLimit = Math.min(limit, 100);
    let similarPapers: Array<{ paper_id: string; similarity: number }>;
    try {
      similarPapers = await this.db.findSimilarPapers({
        queryEmbedding,
        limit: searchLimit,
        similarityThreshold: threshold,
      });
    } catch (error) {
      throw createError(
        `Failed to find similar papers: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'SEARCH_ERROR'
      );
    }

    if (similarPapers.length === 0) {
      return [];
    }

    // Fetch full Paper objects for the returned paper IDs
    const paperIds = similarPapers.map((sp) => sp.paper_id);
    const client = (this.db as any).client;

    const { data: papersData, error: papersError } = await client
      .from('papers')
      .select('*')
      .eq('tenant_id', this.db.tenantId)
      .in('paper_id', paperIds);

    if (papersError) {
      throw createError(`Failed to fetch papers: ${papersError.message}`, 500, 'FETCH_ERROR');
    }

    // Create a map of paper_id -> Paper for efficient lookup
    const papersMap = new Map<string, Paper>();
    (papersData || []).forEach((paper: Paper) => {
      papersMap.set(paper.paper_id, paper);
    });

    // Combine papers with similarity scores, preserving order from findSimilarPapers
    const results: Array<{ paper: Paper; similarity: number }> = [];
    for (const similar of similarPapers) {
      const paper = papersMap.get(similar.paper_id);
      if (paper) {
        results.push({
          paper,
          similarity: similar.similarity,
        });
      }
    }

    return results;
  }
}

import { EmbeddingsClient } from '../embeddings/embed';
import { cosineSimilarity } from '../embeddings/similarity';
import type { DatabaseClient } from '../db/client';

export interface EntityContext {
  name: string;
  type: string;
  definition?: string;  // From evidence or paper section
  paperTitle?: string;  // Context from source paper
  evidence?: string;    // Quote where entity appears
}

export interface EmbeddingPair {
  raw: number[];      // 3072 dimensions for precision
  index: number[];    // 768 dimensions for fast search
}

/**
 * Service for generating entity embeddings with rich context.
 * Produces dual embeddings: full dimension for precision, reduced for indexing.
 */
export class EntityEmbeddingService {
  private emb: EmbeddingsClient;

  constructor(apiKey: string) {
    this.emb = new EmbeddingsClient(apiKey);
  }

  /**
   * Build embedding payload from entity context.
   * Combines name, type, definition, evidence, and paper title for disambiguation.
   */
  private buildEmbeddingPayload(context: EntityContext): string {
    const parts: string[] = [];
    
    parts.push(`Entity name: ${context.name}`);
    parts.push(`Type: ${context.type}`);
    
    if (context.definition) {
      parts.push(`Definition: ${context.definition}`);
    }
    
    if (context.evidence) {
      parts.push(`Evidence: ${context.evidence}`);
    }
    
    if (context.paperTitle) {
      parts.push(`From paper: ${context.paperTitle}`);
    }
    
    return parts.join('\n');
  }

  /**
   * Generate dual embeddings from entity context.
   * Returns both full-dimension (3072) and reduced-dimension (768) embeddings.
   */
  async generateEmbedding(context: EntityContext, tenantId: string): Promise<EmbeddingPair> {
    const payload = this.buildEmbeddingPayload(context);
    
    // Generate full embedding (3072 dimensions)
    const [rawEmbedding] = await this.emb.embedTexts([payload], tenantId, 'gemini-embedding-001');
    
    if (!rawEmbedding) {
      throw new Error('Failed to generate embedding');
    }

    // Reduce to 768 dimensions using PCA-like approach (simple truncation + normalization)
    // In production, you might use actual PCA or random projection
    // For now, we'll use a simple approach: take first 768 dimensions and normalize
    const indexEmbedding = this.reduceDimensions(rawEmbedding, 768);

    return {
      raw: rawEmbedding,
      index: indexEmbedding,
    };
  }

  /**
   * Reduce embedding dimensions using simple truncation and normalization.
   * In production, consider using PCA or random projection for better quality.
   */
  private reduceDimensions(embedding: number[], targetDim: number): number[] {
    if (embedding.length <= targetDim) {
      return embedding;
    }

    // Simple approach: take first targetDim dimensions and normalize
    const reduced = embedding.slice(0, targetDim);
    const magnitude = Math.sqrt(reduced.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude === 0) return reduced;
    
    return reduced.map(val => val / magnitude);
  }

  /**
   * Fast candidate search using indexed embedding (768 dims) via pgvector.
   * Returns top candidates with similarity scores.
   */
  async findSimilarEntities(
    embeddingIndex: number[],
    entityType: string,
    db: DatabaseClient,
    threshold: number = 0.85,
    limit: number = 50
  ): Promise<Array<{ node_id: number; similarity: number }>> {
    return db.findSimilarNodes({
      queryEmbeddingIndex: embeddingIndex,
      entityType,
      similarityThreshold: threshold,
      limit,
    });
  }

  /**
   * Rerank top candidates using raw embedding (3072 dims) for precision.
   * Takes candidates from fast search and reranks using full-dimension similarity.
   */
  async rerankCandidates(
    queryRaw: number[],
    candidates: Array<{ node_id: number; embedding_raw: number[] }>
  ): Promise<Array<{ node_id: number; similarity: number }>> {
    return candidates
      .map(candidate => ({
        node_id: candidate.node_id,
        similarity: cosineSimilarity(queryRaw, candidate.embedding_raw),
      }))
      .sort((a, b) => b.similarity - a.similarity);
  }
}

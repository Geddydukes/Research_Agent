import type { DatabaseClient, Node } from '../db/client';
import { EntityEmbeddingService, type EntityContext, type EmbeddingPair } from './embeddingService';
import { hasSharedPhrase, hasExactDefinitionMatch } from './sharedPhrase';
import { canonicalize } from '../utils/canonicalize';

export interface ResolutionResult {
  action: 'exact_match' | 'propose_link' | 'auto_approve' | 'create_new';
  canonicalNodeId?: number;
  linkProposal?: {
    nodeId: number;
    canonicalNodeId: number;
    confidence: number;
    evidence?: string;
    sharedAlias: boolean;
    sharedPhrase: boolean;
  };
}

interface EntityResolutionConfig {
  thresholds: {
    [entityType: string]: {
      propose: number;
      autoApprove: number;
    };
  };
  acronymLengthThreshold: number;
  requireSharedAlias: boolean;
  requireSharedPhrase: boolean;
}

const DEFAULT_CONFIG: EntityResolutionConfig = {
  thresholds: {
    Method: { propose: 0.90, autoApprove: 0.95 },
    Concept: { propose: 0.90, autoApprove: 0.95 },
    Dataset: { propose: 0.92, autoApprove: 0.97 },
    Metric: { propose: 0.92, autoApprove: 0.97 },
  },
  acronymLengthThreshold: 5,
  requireSharedAlias: false, // OR shared phrase is acceptable
  requireSharedPhrase: false, // OR shared alias is acceptable
};

/**
 * Select canonical node using deterministic policy:
 * 1. Highest total mentions
 * 2. Earliest created_at
 * 3. Lexicographically smallest canonical_name
 */
export function selectCanonicalNode(
  candidateNodes: Array<{
    node_id: number;
    mention_count: number;
    created_at: string;
    canonical_name: string;
  }>
): number {
  if (candidateNodes.length === 0) {
    throw new Error('Cannot select canonical from empty candidates');
  }
  
  if (candidateNodes.length === 1) {
    return candidateNodes[0]!.node_id;
  }
  
  return candidateNodes
    .sort((a, b) => {
      // Primary: total mentions (descending)
      if (a.mention_count !== b.mention_count) {
        return b.mention_count - a.mention_count;
      }
      // Secondary: earliest created (ascending)
      if (a.created_at !== b.created_at) {
        return a.created_at.localeCompare(b.created_at);
      }
      // Tertiary: lexicographically smallest name
      return a.canonical_name.localeCompare(b.canonical_name);
    })[0]!.node_id;
}

/**
 * Check if a node is canonical (not referenced by any approved alias_of link)
 */
async function isCanonicalNode(nodeId: number, db: DatabaseClient): Promise<boolean> {
  const links = await db.getEntityLinks({
    canonicalNodeId: nodeId,
    status: 'approved',
    linkType: 'alias_of',
  });
  return links.length === 0;
}

/**
 * Check if auto-approval should occur based on strict criteria
 */
export function shouldAutoApprove(
  similarity: number,
  entityType: string,
  entityName: string,
  sharedAlias: boolean,
  sharedPhrase: boolean,
  config: EntityResolutionConfig = DEFAULT_CONFIG
): boolean {
  const typeThresholds = config.thresholds[entityType] || config.thresholds.Method;
  
  // Never auto-approve short acronyms
  if (entityName.length <= config.acronymLengthThreshold) {
    return false;
  }
  
  // Require high similarity AND (shared alias OR shared phrase)
  const hasSharedSignal = sharedAlias || sharedPhrase;
  if (!hasSharedSignal) {
    return false;
  }
  
  return similarity >= typeThresholds.autoApprove;
}

/**
 * Entity resolver with two-tier resolution system.
 * Tier A: Exact canonical match (deterministic)
 * Tier B: Semantic candidate generation (proposals)
 */
export class EntityResolver {
  private embeddingService: EntityEmbeddingService;
  public config: EntityResolutionConfig;

  constructor(embeddingService: EntityEmbeddingService, config?: Partial<EntityResolutionConfig>) {
    this.embeddingService = embeddingService;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  shouldAutoApprove(
    similarity: number,
    entityType: string,
    entityName: string,
    sharedAlias: boolean,
    sharedPhrase: boolean
  ): boolean {
    return shouldAutoApprove(similarity, entityType, entityName, sharedAlias, sharedPhrase, this.config);
  }

  /**
   * Tier A: Resolve exact canonical match
   */
  async resolveExactMatch(
    canonicalName: string,
    entityType: string,
    db: DatabaseClient
  ): Promise<number | null> {
    const canonicalKey = canonicalize(canonicalName);
    const existing = await db.findNodesByCanonicalNames([
      { canonical_name: canonicalKey, type: entityType },
    ]);
    
    const key = `${canonicalKey}|${entityType}`;
    const node = existing.get(key);
    
    return node ? node.id : null;
  }

  /**
   * Tier B: Find semantic candidates using embeddings
   */
  async findSemanticCandidates(
    embeddingPair: EmbeddingPair,
    entityType: string,
    _entityName: string,
    db: DatabaseClient
  ): Promise<Array<{
    node_id: number;
    similarity: number;
    node: Node;
    sharedAlias: boolean;
    sharedPhrase: boolean;
  }>> {
    // Fast search using indexed embedding
    const candidates = await this.embeddingService.findSimilarEntities(
      embeddingPair.index,
      entityType,
      db,
      this.config.thresholds[entityType]?.propose || 0.90,
      50 // Get more candidates for reranking
    );

    if (candidates.length === 0) {
      return [];
    }

    // Get full node data and raw embeddings for reranking
    const nodeIds = candidates.map(c => c.node_id);
    const { data: nodes } = await db.client
      .from('nodes')
      .select('id, canonical_name, type, embedding_raw, metadata')
      .in('id', nodeIds)
      .eq('tenant_id', db.tenantId);

    if (!nodes || nodes.length === 0) {
      return [];
    }

    // Rerank using raw embeddings
    const nodesWithEmbeddings = nodes.filter((n: any) => n.embedding_raw);
    const reranked = await this.embeddingService.rerankCandidates(
      embeddingPair.raw,
      nodesWithEmbeddings.map((n: any) => ({
        node_id: n.id,
        embedding_raw: n.embedding_raw,
      }))
    );

    // Get top candidates and check for shared signals
    const topCandidates = reranked.slice(0, 10);
    const results = await Promise.all(
      topCandidates.map(async (candidate) => {
        const node = nodes.find((n: any) => n.id === candidate.node_id) as any;
        if (!node) return null;

        // Note: sharedAlias and sharedPhrase will be checked later when we have the new entity's data
        // For now, we'll check these in the main resolveEntity method
        const sharedAlias = false; // Will be computed later
        const sharedPhrase = false; // Will be computed later

        return {
          node_id: candidate.node_id,
          similarity: candidate.similarity,
          node: node as Node,
          sharedAlias,
          sharedPhrase,
        };
      })
    );

    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  }

  /**
   * Main resolution logic
   */
  async resolveEntity(
    entity: EntityContext,
    embeddingPair: EmbeddingPair,
    db: DatabaseClient
  ): Promise<ResolutionResult> {
    // Tier A: Check exact match first
    const exactMatch = await this.resolveExactMatch(entity.name, entity.type, db);
    if (exactMatch) {
      return {
        action: 'exact_match',
        canonicalNodeId: exactMatch,
      };
    }

    // Tier B: Find semantic candidates
    const candidates = await this.findSemanticCandidates(embeddingPair, entity.type, entity.name, db);

    if (candidates.length === 0) {
      return { action: 'create_new' };
    }

    // Get mention counts for canonical selection
    const candidateIds = candidates.map(c => c.node_id);
    const { data: mentions } = await db.client
      .from('entity_mentions')
      .select('node_id')
      .in('node_id', candidateIds)
      .eq('tenant_id', db.tenantId);

    const mentionCounts = new Map<number, number>();
    for (const mention of mentions || []) {
      mentionCounts.set(mention.node_id, (mentionCounts.get(mention.node_id) || 0) + 1);
    }

    // Get node creation dates
    const { data: nodesData } = await db.client
      .from('nodes')
      .select('id, created_at')
      .in('id', candidateIds)
      .eq('tenant_id', db.tenantId);

    const nodeDates = new Map<number, string>();
    for (const node of nodesData || []) {
      nodeDates.set(node.id, node.created_at);
    }

    // Select canonical node using deterministic policy
    const candidatesWithMetadata = candidates.map(c => ({
      node_id: c.node_id,
      mention_count: mentionCounts.get(c.node_id) || 0,
      created_at: nodeDates.get(c.node_id) || new Date().toISOString(),
      canonical_name: c.node.canonical_name,
      similarity: c.similarity,
      sharedAlias: c.sharedAlias,
      sharedPhrase: c.sharedPhrase,
    }));

    const canonicalNodeId = selectCanonicalNode(candidatesWithMetadata);
    const canonicalCandidate = candidatesWithMetadata.find(c => c.node_id === canonicalNodeId)!;

    // Check if we should auto-approve
    const autoApprove = shouldAutoApprove(
      canonicalCandidate.similarity,
      entity.type,
      entity.name,
      canonicalCandidate.sharedAlias,
      canonicalCandidate.sharedPhrase,
      this.config
    );

    // Check cycle prevention: canonical nodes cannot have outgoing alias_of
    const isCanonical = await isCanonicalNode(canonicalNodeId, db);
    if (!isCanonical) {
      // If the selected canonical is itself aliased, we need to find the true canonical
      const canonicalLinks = await db.getEntityLinks({
        nodeId: canonicalNodeId,
        status: 'approved',
        linkType: 'alias_of',
      });
      if (canonicalLinks.length > 0) {
        const trueCanonical = canonicalLinks[0]!.canonical_node_id;
        return {
          action: autoApprove ? 'auto_approve' : 'propose_link',
          canonicalNodeId: trueCanonical,
          linkProposal: {
            nodeId: 0, // Will be set when entity is created
            canonicalNodeId: trueCanonical,
            confidence: canonicalCandidate.similarity,
            sharedAlias: canonicalCandidate.sharedAlias,
            sharedPhrase: canonicalCandidate.sharedPhrase,
          },
        };
      }
    }

    // Check shared signals with the new entity's context
    const newEntityAliases = [entity.name.toLowerCase()];
    const candidateAliases = await db.getEntityAliases(canonicalNodeId);
    const candidateAliasSet = new Set(candidateAliases.map(a => a.alias_name.toLowerCase()));
    const hasSharedAliasSignal = newEntityAliases.some(a => candidateAliasSet.has(a));

    const candidateNode = candidates.find(c => c.node_id === canonicalNodeId)!;
    const candidateDefinition = candidateNode.node.metadata?.definition as string | undefined;
    const hasSharedPhraseSignal = hasSharedPhrase(entity.definition, candidateDefinition) ||
                                  hasExactDefinitionMatch(entity.evidence, candidateNode.node.metadata?.evidence as string | undefined);

    // Re-check auto-approval with actual shared signals
    const finalAutoApprove = shouldAutoApprove(
      canonicalCandidate.similarity,
      entity.type,
      entity.name,
      hasSharedAliasSignal,
      hasSharedPhraseSignal,
      this.config
    );

    return {
      action: finalAutoApprove ? 'auto_approve' : 'propose_link',
      canonicalNodeId,
      linkProposal: {
        nodeId: 0, // Will be set when entity is created
        canonicalNodeId,
        confidence: canonicalCandidate.similarity,
        sharedAlias: hasSharedAliasSignal,
        sharedPhrase: hasSharedPhraseSignal,
      },
    };
  }
}

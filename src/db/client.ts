import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Tenant-related interfaces
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: 'owner' | 'member' | 'viewer';
  created_at: string;
}

export interface TenantSettings {
  tenant_id: string;
  default_model_choices: Record<string, unknown>;
  max_papers_per_run: number | null;
  max_reasoning_depth: number;
  semantic_gating_threshold: number;
  allow_speculative_edges: boolean;
  enabled_relationship_types: string[];
  execution_mode: 'hosted' | 'byo_key';
  api_key_encrypted: string | null;
  monthly_cost_limit?: number | null;
  monthly_token_limit?: number | null;
  daily_cost_limit?: number | null;
  daily_token_limit?: number | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineJob {
  id: string;
  tenant_id: string;
  paper_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Node {
  id: number;
  tenant_id: string;
  type: string;
  canonical_name: string;
  metadata: Record<string, unknown> | null;
  original_confidence: number | null;
  adjusted_confidence: number | null;
  review_status: 'approved' | 'flagged' | 'rejected' | null;
  review_reasons: string | null;
  embedding_raw: number[] | null;
  embedding_index: number[] | null;
  created_at: string;
}

export interface Edge {
  id: number;
  tenant_id: string;
  source_node_id: number;
  target_node_id: number;
  relationship_type: string;
  confidence: number;
  evidence: string | null;
  provenance: Record<string, unknown> | null;
  review_status: 'approved' | 'flagged' | 'rejected' | null;
  review_reasons: string | null;
  created_at: string;
}

export interface Paper {
  paper_id: string;
  tenant_id: string;
  title: string | null;
  abstract: string | null;
  year: number | null;
  metadata: Record<string, unknown> | null;
  embedding: number[] | null;
  created_at: string;
}

export interface PaperSection {
  id: number;
  tenant_id: string;
  paper_id: string;
  section_type: string;
  content: string;
  word_count: number | null;
  part_index: number;
  created_at: string;
}

export interface EntityMention {
  id: number;
  tenant_id: string;
  node_id: number;
  paper_id: string;
  section_type: string | null;
  mention_count: number;
  created_at: string;
}

export interface InferredInsight {
  id: number;
  tenant_id: string;
  insight_type: string;
  subject_nodes: number[];
  reasoning_path: Record<string, unknown> | null;
  confidence: number;
  created_at: string;
}

export interface NodeTypeRegistry {
  type_name: string;
  description: string | null;
}

export interface EntityLink {
  id: number;
  node_id: number;
  canonical_node_id: number;
  link_type: 'alias_of' | 'same_as_candidate';
  confidence: number;
  status: 'proposed' | 'approved' | 'rejected';
  evidence: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  tenant_id: string;
}

export interface InsertEntityLink {
  node_id: number;
  canonical_node_id: number;
  link_type: 'alias_of' | 'same_as_candidate';
  confidence: number;
  status: 'proposed' | 'approved' | 'rejected';
  evidence?: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

export interface EntityAlias {
  id: number;
  node_id: number;
  alias_name: string;
  source_paper_id: string | null;
  tenant_id: string;
  created_at: string;
}

export interface InsertEntityAlias {
  node_id: number;
  alias_name: string;
  source_paper_id?: string;
}

export interface InsertNode {
  type: string;
  canonical_name: string;
  metadata?: Record<string, unknown>;
  original_confidence?: number;
  adjusted_confidence?: number;
  review_status?: 'approved' | 'flagged' | 'rejected';
  review_reasons?: string;
  embedding_raw?: number[];
  embedding_index?: number[];
}

export interface InsertEdge {
  source_node_id: number;
  target_node_id: number;
  relationship_type: string;
  confidence: number;
  evidence?: string;
  provenance?: Record<string, unknown>;
  review_status?: 'approved' | 'flagged' | 'rejected';
  review_reasons?: string;
}

export interface InsertPaper {
  paper_id: string;
  title?: string;
  abstract?: string;
  year?: number;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface InsertPaperSection {
  paper_id: string;
  section_type: string;
  content: string;
  word_count?: number;
  part_index?: number;
}

export interface InsertEntityMention {
  node_id: number;
  paper_id: string;
  section_type?: string;
  mention_count?: number;
}

export interface InsertInferredInsight {
  insight_type: string;
  subject_nodes: number[];
  reasoning_path?: Record<string, unknown>;
  confidence: number;
}

export class DatabaseClient {
  public client: SupabaseClient;
  public tenantId: string;

  constructor(url: string, serviceRoleKey: string, tenantId: string) {
    this.client = createClient(url, serviceRoleKey);
    this.tenantId = tenantId;
  }

  async insertPaper(paper: InsertPaper): Promise<Paper> {
    const { data, error } = await this.client
      .from('papers')
      .insert({ ...paper, tenant_id: this.tenantId })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert paper: ${error.message}`);
    }

    return data as Paper;
  }

  async upsertPaper(paper: InsertPaper): Promise<Paper> {
    const { data, error } = await this.client
      .from('papers')
      .upsert({ ...paper, tenant_id: this.tenantId }, { onConflict: 'paper_id' })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert paper: ${error.message}`);
    }

    return data as Paper;
  }

  async getExistingPaperIds(paperIds: string[]): Promise<Set<string>> {
    if (paperIds.length === 0) return new Set();
    
    const { data, error } = await this.client
      .from('papers')
      .select('paper_id')
      .eq('tenant_id', this.tenantId)
      .in('paper_id', paperIds);

    if (error) {
      throw new Error(`Failed to get existing papers: ${error.message}`);
    }

    return new Set((data || []).map((p: { paper_id: string }) => p.paper_id));
  }

  async paperExists(paperId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('papers')
      .select('paper_id')
      .eq('tenant_id', this.tenantId)
      .eq('paper_id', paperId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to check paper existence: ${error.message}`);
    }

    return data !== null;
  }

  async upsertPaperEmbedding(paperId: string, embedding: number[]): Promise<void> {
    const { error } = await this.client
      .from('papers')
      .update({ embedding })
      .eq('paper_id', paperId)
      .eq('tenant_id', this.tenantId);

    if (error) {
      throw new Error(`Failed to upsert embedding: ${error.message}`);
    }
  }

  async getPaperEmbedding(paperId: string): Promise<number[] | null> {
    const { data, error } = await this.client
      .from('papers')
      .select('embedding')
      .eq('paper_id', paperId)
      .eq('tenant_id', this.tenantId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get embedding: ${error.message}`);
    }

    if (!data?.embedding) return null;

    // Supabase returns vector as string "[1,2,3,...]" or as array
    // Handle both cases
    const embedding = data.embedding;
    if (typeof embedding === 'string') {
      // Parse string format "[1,2,3,...]"
      return JSON.parse(embedding) as number[];
    }
    if (Array.isArray(embedding)) {
      return embedding;
    }
    
    return null;
  }

  async findSimilarPapers(params: {
    queryEmbedding: number[];
    limit?: number;
    similarityThreshold?: number;
    excludePaperIds?: string[];
  }): Promise<Array<{ paper_id: string; similarity: number }>> {
    const {
      queryEmbedding,
      limit = 100,
      similarityThreshold = 0,
      excludePaperIds = [],
    } = params;

    // Use RPC function for vector similarity search
    // PostgREST/Supabase expects vector as array for RPC calls
    const { data, error } = await this.client.rpc('find_similar_papers', {
      query_embedding: queryEmbedding,
      similarity_threshold: similarityThreshold,
      result_limit: limit,
      exclude_ids: excludePaperIds,
      tenant_id_param: this.tenantId,
    });

    if (error) {
      throw new Error(`Failed to find similar papers: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      paper_id: row.paper_id,
      similarity: row.similarity,
    }));
  }

  async insertPaperSections(sections: InsertPaperSection[]): Promise<PaperSection[]> {
    if (sections.length === 0) {
      return [];
    }

    const sectionsWithTenant = sections.map(s => ({ ...s, tenant_id: this.tenantId }));
    const { data, error } = await this.client
      .from('paper_sections')
      .insert(sectionsWithTenant)
      .select();

    if (error) {
      throw new Error(`Failed to insert paper sections: ${error.message}`);
    }

    return data as PaperSection[];
  }

  async insertNode(node: InsertNode): Promise<Node> {
    const { data, error } = await this.client
      .from('nodes')
      .insert({ ...node, tenant_id: this.tenantId })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert node: ${error.message}`);
    }

    return data as Node;
  }

  async insertNodes(nodes: InsertNode[]): Promise<Node[]> {
    if (nodes.length === 0) {
      return [];
    }

    const nodesWithTenant = nodes.map(n => ({ ...n, tenant_id: this.tenantId }));
    const { data, error } = await this.client
      .from('nodes')
      .insert(nodesWithTenant)
      .select();

    if (error) {
      throw new Error(`Failed to insert nodes: ${error.message}`);
    }

    return data as Node[];
  }

  async insertEdge(edge: InsertEdge): Promise<Edge> {
    const { data, error } = await this.client
      .from('edges')
      .insert({ ...edge, tenant_id: this.tenantId })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert edge: ${error.message}`);
    }

    return data as Edge;
  }

  async insertEdges(edges: InsertEdge[]): Promise<Edge[]> {
    if (edges.length === 0) {
      return [];
    }

    const edgesWithTenant = edges.map(e => ({ ...e, tenant_id: this.tenantId }));
    const { data, error } = await this.client
      .from('edges')
      .insert(edgesWithTenant)
      .select();

    if (error) {
      throw new Error(`Failed to insert edges: ${error.message}`);
    }

    return data as Edge[];
  }

  async updateEdgeEvidence(
    edgeId: number,
    evidence: string,
    provenance: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.client
      .from('edges')
      .update({
        evidence: evidence.slice(0, 300),
        provenance,
      })
      .eq('id', edgeId)
      .eq('tenant_id', this.tenantId);

    if (error) {
      throw new Error(`Failed to update edge evidence: ${error.message}`);
    }
  }

  async updateEdgeProvenance(
    edgeId: number,
    provenance: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.client
      .from('edges')
      .update({
        provenance,
      })
      .eq('id', edgeId)
      .eq('tenant_id', this.tenantId);

    if (error) {
      throw new Error(`Failed to update edge provenance: ${error.message}`);
    }
  }

  async updateEdgesProvenance(
    updates: Array<{
      edgeId: number;
      provenance: Record<string, unknown>;
    }>
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    await Promise.all(
      updates.map((update) =>
        this.updateEdgeProvenance(update.edgeId, update.provenance)
      )
    );
  }

  async updateEdgesEvidence(
    updates: Array<{
      edgeId: number;
      evidence: string;
      provenance: Record<string, unknown>;
    }>
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    await Promise.all(
      updates.map((update) =>
        this.updateEdgeEvidence(update.edgeId, update.evidence, update.provenance)
      )
    );
  }

  // Entity Links methods
  async insertEntityLink(link: InsertEntityLink): Promise<EntityLink> {
    const { data, error } = await this.client
      .from('entity_links')
      .insert({ ...link, tenant_id: this.tenantId })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert entity link: ${error.message}`);
    }

    return data as EntityLink;
  }

  async getEntityLinks(params: {
    nodeId?: number;
    canonicalNodeId?: number;
    status?: 'proposed' | 'approved' | 'rejected';
    linkType?: 'alias_of' | 'same_as_candidate';
  }): Promise<EntityLink[]> {
    let query = this.client
      .from('entity_links')
      .select('*')
      .eq('tenant_id', this.tenantId);

    if (params.nodeId) {
      query = query.eq('node_id', params.nodeId);
    }
    if (params.canonicalNodeId) {
      query = query.eq('canonical_node_id', params.canonicalNodeId);
    }
    if (params.status) {
      query = query.eq('status', params.status);
    }
    if (params.linkType) {
      query = query.eq('link_type', params.linkType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get entity links: ${error.message}`);
    }

    return (data || []) as EntityLink[];
  }

  async getApprovedAliasTargetsForNodes(nodeIds: number[]): Promise<Map<number, number>> {
    if (nodeIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.client
      .from('entity_links')
      .select('node_id, canonical_node_id')
      .eq('tenant_id', this.tenantId)
      .eq('status', 'approved')
      .eq('link_type', 'alias_of')
      .in('node_id', nodeIds);

    if (error) {
      throw new Error(`Failed to get approved alias targets: ${error.message}`);
    }

    const aliasTargets = new Map<number, number>();
    for (const row of data || []) {
      const nodeId = (row as any).node_id as number;
      const canonicalNodeId = (row as any).canonical_node_id as number;
      if (!aliasTargets.has(nodeId)) {
        aliasTargets.set(nodeId, canonicalNodeId);
      }
    }

    return aliasTargets;
  }

  async updateEntityLinkStatus(
    linkId: number,
    status: 'approved' | 'rejected',
    reviewedBy?: string
  ): Promise<EntityLink> {
    const { data, error } = await this.client
      .from('entity_links')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy,
      })
      .eq('id', linkId)
      .eq('tenant_id', this.tenantId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update entity link status: ${error.message}`);
    }

    return data as EntityLink;
  }

  // Entity Aliases methods
  async insertEntityAlias(alias: InsertEntityAlias): Promise<EntityAlias> {
    const { data, error } = await this.client
      .from('entity_aliases')
      .insert({ ...alias, tenant_id: this.tenantId })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert entity alias: ${error.message}`);
    }

    return data as EntityAlias;
  }

  async getEntityAliases(nodeId: number): Promise<EntityAlias[]> {
    const { data, error } = await this.client
      .from('entity_aliases')
      .select('*')
      .eq('node_id', nodeId)
      .eq('tenant_id', this.tenantId);

    if (error) {
      throw new Error(`Failed to get entity aliases: ${error.message}`);
    }

    return (data || []) as EntityAlias[];
  }

  async findSimilarNodes(params: {
    queryEmbeddingIndex: number[];
    entityType: string;
    limit?: number;
    similarityThreshold?: number;
    excludeNodeIds?: number[];
  }): Promise<Array<{ node_id: number; similarity: number }>> {
    const {
      queryEmbeddingIndex,
      entityType,
      limit = 50,
      similarityThreshold = 0.85,
      excludeNodeIds = [],
    } = params;

    // Use RPC function for vector similarity search
    const { data, error } = await this.client.rpc('find_similar_nodes', {
      query_embedding_index: queryEmbeddingIndex,
      entity_type: entityType,
      similarity_threshold: similarityThreshold,
      result_limit: limit,
      exclude_ids: excludeNodeIds,
      tenant_id_param: this.tenantId,
    });

    if (error) {
      throw new Error(`Failed to find similar nodes: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      node_id: row.node_id,
      similarity: row.similarity,
    }));
  }

  async upsertNodeEmbeddings(
    nodeId: number,
    embeddingRaw: number[],
    embeddingIndex: number[]
  ): Promise<void> {
    const { error } = await this.client
      .from('nodes')
      .update({
        embedding_raw: embeddingRaw,
        embedding_index: embeddingIndex,
      })
      .eq('id', nodeId)
      .eq('tenant_id', this.tenantId);

    if (error) {
      throw new Error(`Failed to upsert node embeddings: ${error.message}`);
    }
  }

  async insertEntityMentions(mentions: InsertEntityMention[]): Promise<EntityMention[]> {
    if (mentions.length === 0) {
      return [];
    }

    const mentionsWithTenant = mentions.map(m => ({ ...m, tenant_id: this.tenantId }));
    const { data, error } = await this.client
      .from('entity_mentions')
      .insert(mentionsWithTenant)
      .select();

    if (error) {
      throw new Error(`Failed to insert entity mentions: ${error.message}`);
    }

    return data as EntityMention[];
  }

  async insertInsights(insights: InsertInferredInsight[]): Promise<InferredInsight[]> {
    if (insights.length === 0) {
      return [];
    }

    const insightsWithTenant = insights.map(i => ({ ...i, tenant_id: this.tenantId }));
    const { data, error } = await this.client
      .from('inferred_insights')
      .insert(insightsWithTenant)
      .select();

    if (error) {
      throw new Error(`Failed to insert insights: ${error.message}`);
    }

    return data as InferredInsight[];
  }

  async getEdgeModal(edgeId: number): Promise<{
    edge: Edge;
    source_node: Node | null;
    target_node: Node | null;
    source_paper: Paper | null;
    target_paper: Paper | null;
  } | null> {
    const { data, error } = await this.client
      .from('edges')
      .select('*')
      .eq('id', edgeId)
      .eq('tenant_id', this.tenantId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get edge modal: ${error.message}`);
    }

    if (!data) return null;

    const edge = data as Edge;
    const meta = (edge.provenance as any)?.meta || {};
    const sourcePaperId = meta.source_paper_id as string | undefined;
    const targetPaperId = meta.target_paper_id as string | undefined;

    const [sourceNode, targetNode, sourcePaper, targetPaper] = await Promise.all([
      this.client.from('nodes').select('*').eq('id', edge.source_node_id).eq('tenant_id', this.tenantId).maybeSingle(),
      this.client.from('nodes').select('*').eq('id', edge.target_node_id).eq('tenant_id', this.tenantId).maybeSingle(),
      sourcePaperId
        ? this.client.from('papers').select('*').eq('paper_id', sourcePaperId).eq('tenant_id', this.tenantId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      targetPaperId
        ? this.client.from('papers').select('*').eq('paper_id', targetPaperId).eq('tenant_id', this.tenantId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (sourceNode.error) throw new Error(`Failed to get source node: ${sourceNode.error.message}`);
    if (targetNode.error) throw new Error(`Failed to get target node: ${targetNode.error.message}`);
    if (sourcePaper.error) throw new Error(`Failed to get source paper: ${sourcePaper.error.message}`);
    if (targetPaper.error) throw new Error(`Failed to get target paper: ${targetPaper.error.message}`);

    return {
      edge,
      source_node: (sourceNode.data as Node) || null,
      target_node: (targetNode.data as Node) || null,
      source_paper: (sourcePaper.data as Paper) || null,
      target_paper: (targetPaper.data as Paper) || null,
    };
  }

  async getInsightsForEdge(edgeId: number): Promise<InferredInsight[]> {
    // Fetch edge to get involved nodes
    const edgeModal = await this.getEdgeModal(edgeId);
    if (!edgeModal) return [];
    const { edge } = edgeModal;
    const nodeIds = [edge.source_node_id, edge.target_node_id].filter(
      (v): v is number => typeof v === 'number'
    );

    const { data, error } = await this.client
      .from('inferred_insights')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .overlaps('subject_nodes', nodeIds);

    if (error) {
      throw new Error(`Failed to get insights for edge: ${error.message}`);
    }

    return (data || []) as InferredInsight[];
  }

  async getNodesForPaper(paperId: string, reviewStatus?: 'approved' | 'flagged' | 'rejected'): Promise<Node[]> {
    let query = this.client
      .from('entity_mentions')
      .select(`
        node_id,
        nodes (*)
      `)
      .eq('paper_id', paperId)
      .eq('tenant_id', this.tenantId);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get nodes for paper: ${error.message}`);
    }

    // Extract unique nodes from the join
    // Exclude Paper nodes - papers are not part of the graph visualization
    const nodeMap = new Map<number, Node>();
    for (const item of data || []) {
      if (item.nodes && !nodeMap.has(item.node_id)) {
        const node = Array.isArray(item.nodes) ? item.nodes[0] : item.nodes;
        if (node) {
          const nodeData = node as Node;
          // Skip Paper nodes
          if (nodeData.type === 'Paper') continue;
          // Filter by review_status if specified, otherwise return all
          if (!reviewStatus || nodeData.review_status === reviewStatus) {
            nodeMap.set(item.node_id, nodeData);
          }
        }
      }
    }

    return Array.from(nodeMap.values());
  }

  async getEdgesForPaper(paperId: string, reviewStatus?: 'approved' | 'flagged' | 'rejected'): Promise<Edge[]> {
    const nodes = await this.getNodesForPaper(paperId);
    const nodeIds = nodes.map(n => n.id);

    if (nodeIds.length === 0) {
      return [];
    }

    let query = this.client
      .from('edges')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .or(`source_node_id.in.(${nodeIds.join(',')}),target_node_id.in.(${nodeIds.join(',')})`);

    // Filter by review_status if specified
    if (reviewStatus) {
      query = query.eq('review_status', reviewStatus);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get edges for paper: ${error.message}`);
    }

    return (data || []) as Edge[];
  }

  async getGraphData(): Promise<{ nodes: Node[]; edges: Edge[] }> {
    // Return ONLY approved nodes and edges for main graph endpoint
    // Exclude Paper nodes - papers are not part of the graph visualization
    const [nodesResult, edgesResult] = await Promise.all([
      this.client.from('nodes').select('*').eq('tenant_id', this.tenantId).eq('review_status', 'approved').neq('type', 'Paper'),
      this.client.from('edges').select('*').eq('tenant_id', this.tenantId).eq('review_status', 'approved'),
    ]);

    if (nodesResult.error) {
      throw new Error(`Failed to get nodes: ${nodesResult.error.message}`);
    }

    if (edgesResult.error) {
      throw new Error(`Failed to get edges: ${edgesResult.error.message}`);
    }

    return {
      nodes: (nodesResult.data || []) as Node[],
      edges: (edgesResult.data || []) as Edge[],
    };
  }

  async getReviewGraphData(): Promise<{ nodes: Node[]; edges: Edge[] }> {
    // Return nodes and edges that need review (flagged or rejected, excluding null)
    // Exclude Paper nodes - papers are not part of the graph visualization
    // Use .in() to explicitly match flagged or rejected status
    const [nodesResult, edgesResult] = await Promise.all([
      this.client.from('nodes').select('*').eq('tenant_id', this.tenantId).in('review_status', ['flagged', 'rejected']).neq('type', 'Paper'),
      this.client.from('edges').select('*').eq('tenant_id', this.tenantId).in('review_status', ['flagged', 'rejected']),
    ]);

    if (nodesResult.error) {
      throw new Error(`Failed to get review nodes: ${nodesResult.error.message}`);
    }

    if (edgesResult.error) {
      throw new Error(`Failed to get review edges: ${edgesResult.error.message}`);
    }

    return {
      nodes: (nodesResult.data || []) as Node[],
      edges: (edgesResult.data || []) as Edge[],
    };
  }

  async getAllGraphData(): Promise<{ nodes: Node[]; edges: Edge[] }> {
    // Return ALL nodes and edges regardless of review_status (for rescoring)
    const [nodesResult, edgesResult] = await Promise.all([
      this.client.from('nodes').select('*').eq('tenant_id', this.tenantId),
      this.client.from('edges').select('*').eq('tenant_id', this.tenantId),
    ]);

    if (nodesResult.error) {
      throw new Error(`Failed to get all nodes: ${nodesResult.error.message}`);
    }

    if (edgesResult.error) {
      throw new Error(`Failed to get all edges: ${edgesResult.error.message}`);
    }

    return {
      nodes: (nodesResult.data || []) as Node[],
      edges: (edgesResult.data || []) as Edge[],
    };
  }

  async updateNodeReviewStatus(
    nodeId: number,
    reviewStatus: 'approved' | 'flagged' | 'rejected',
    reviewReasons?: string,
    adjustedConfidence?: number
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      review_status: reviewStatus,
      review_reasons: reviewReasons || null,
    };
    
    if (adjustedConfidence !== undefined) {
      updateData.adjusted_confidence = adjustedConfidence;
    }

    const { error } = await this.client
      .from('nodes')
      .update(updateData)
      .eq('id', nodeId)
      .eq('tenant_id', this.tenantId);

    if (error) {
      throw new Error(`Failed to update node review status: ${error.message}`);
    }
  }

  async updateNodesReviewStatus(
    updates: Array<{
      nodeId: number;
      reviewStatus: 'approved' | 'flagged' | 'rejected';
      reviewReasons?: string;
      adjustedConfidence?: number;
    }>
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    await Promise.all(
      updates.map((update) =>
        this.updateNodeReviewStatus(update.nodeId, update.reviewStatus, update.reviewReasons, update.adjustedConfidence)
      )
    );
  }

  async updateEdgeReviewStatus(
    edgeId: number,
    reviewStatus: 'approved' | 'flagged' | 'rejected',
    reviewReasons?: string
  ): Promise<void> {
    const { error } = await this.client
      .from('edges')
      .update({
        review_status: reviewStatus,
        review_reasons: reviewReasons || null,
      })
      .eq('id', edgeId)
      .eq('tenant_id', this.tenantId);

    if (error) {
      throw new Error(`Failed to update edge review status: ${error.message}`);
    }
  }

  async updateEdgesReviewStatus(
    updates: Array<{
      edgeId: number;
      reviewStatus: 'approved' | 'flagged' | 'rejected';
      reviewReasons?: string;
    }>
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    await Promise.all(
      updates.map((update) =>
        this.updateEdgeReviewStatus(update.edgeId, update.reviewStatus, update.reviewReasons)
      )
    );
  }

  async findNodeByCanonicalName(
    canonicalName: string,
    type: string
  ): Promise<Node | null> {
    const { data, error } = await this.client
      .from('nodes')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('canonical_name', canonicalName)
      .eq('type', type)
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to find node: ${error.message}`);
    }

    return data as Node;
  }

  async findNodesByCanonicalNames(
    pairs: Array<{ canonical_name: string; type: string }>
  ): Promise<Map<string, Node>> {
    if (pairs.length === 0) {
      return new Map();
    }

    const conditions = pairs.map(
      (p) => `canonical_name.eq.${p.canonical_name}.and.type.eq.${p.type}`
    );
    const orCondition = conditions.join(',');

    const { data, error } = await this.client
      .from('nodes')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .or(orCondition);

    if (error) {
      throw new Error(`Failed to find nodes: ${error.message}`);
    }

    const result = new Map<string, Node>();
    for (const node of (data || []) as Node[]) {
      const key = `${node.canonical_name}|${node.type}`;
      result.set(key, node);
    }

    return result;
  }

  async getPaperSections(paperId: string): Promise<PaperSection[]> {
    const { data, error } = await this.client
      .from('paper_sections')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('paper_id', paperId)
      .order('part_index', { ascending: true });

    if (error) {
      throw new Error(`Failed to get paper sections: ${error.message}`);
    }

    return (data || []) as PaperSection[];
  }

  async upsertNodeType(
    typeName: string,
    description: string
  ): Promise<void> {
    const { error } = await this.client
      .from('node_type_registry')
      .upsert(
        { type_name: typeName, description },
        { onConflict: 'type_name' }
      );

    if (error) {
      throw new Error(`Failed to upsert node type: ${error.message}`);
    }
  }

  /**
   * Get node by ID - for API use
   */
  async getNodeById(nodeId: number, reviewStatus?: 'approved' | 'flagged' | 'rejected'): Promise<Node | null> {
    let query = this.client
      .from('nodes')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('id', nodeId)
      .neq('type', 'Paper'); // Exclude Paper nodes from graph queries

    // Filter by review_status if specified (default to approved for main graph)
    if (reviewStatus) {
      query = query.eq('review_status', reviewStatus);
    } else {
      // Default to approved for main graph queries
      query = query.eq('review_status', 'approved');
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get node: ${error.message}`);
    }

    return data as Node | null;
  }

  /**
   * Get edges for a node - for API use
   */
  async getEdgesForNode(nodeId: number, reviewStatus?: 'approved' | 'flagged' | 'rejected'): Promise<Edge[]> {
    let query = this.client
      .from('edges')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`);

    // Filter by review_status if specified (default to approved for main graph)
    if (reviewStatus) {
      query = query.eq('review_status', reviewStatus);
    } else {
      // Default to approved for main graph queries
      query = query.eq('review_status', 'approved');
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get edges: ${error.message}`);
    }

    return (data || []) as Edge[];
  }

  /**
   * Get all papers that mention a node (via entity_mentions)
   * Includes URL construction from externalIds and adds name field (title)
   */
  async getPapersForNode(nodeId: number): Promise<Array<Paper & { name: string }>> {
    const { data, error } = await this.client
      .from('entity_mentions')
      .select(`
        paper_id,
        papers!inner (*)
      `)
      .eq('node_id', nodeId)
      .eq('tenant_id', this.tenantId);

    if (error) {
      throw new Error(`Failed to get papers for node: ${error.message}`);
    }

    // Extract unique papers and construct URLs
    const paperMap = new Map<string, Paper & { name: string }>();
    for (const item of data || []) {
      if (item.papers) {
        const paper = (Array.isArray(item.papers) ? item.papers[0] : item.papers) as Paper;
        if (paper && !paperMap.has(paper.paper_id)) {
          // Construct URL from externalIds if available
          const url = this.constructPaperUrl(paper);
          // Use title as name, fallback to paper_id if title is missing
          const name = paper.title || paper.paper_id;
          paperMap.set(paper.paper_id, {
            ...paper,
            name,
            metadata: {
              ...paper.metadata,
              url, // Add constructed URL to metadata
            },
          });
        }
      }
    }

    return Array.from(paperMap.values());
  }

  /**
   * Construct paper URL from externalIds in metadata
   */
  private constructPaperUrl(paper: Paper): string | null {
    const metadata = paper.metadata as Record<string, unknown> | null;
    if (!metadata) return null;

    const externalIds = metadata.externalIds as Record<string, string> | undefined;
    if (!externalIds) return null;

    // Try ArXiv first
    const arxivId = externalIds.ArXiv || externalIds.arXiv || externalIds.arxiv;
    if (arxivId) {
      // Normalize ArXiv ID (remove version if present for abs URL)
      const normalized = arxivId.replace(/v\d+$/, '');
      return `https://arxiv.org/abs/${normalized}`;
    }

    // Try DOI
    const doi = externalIds.DOI || externalIds.doi;
    if (doi) {
      return `https://doi.org/${doi}`;
    }

    // Try Semantic Scholar CorpusId
    const corpusId = externalIds.CorpusId;
    if (corpusId) {
      return `https://www.semanticscholar.org/paper/${corpusId}`;
    }

    // Try Semantic Scholar paperId (if paper_id looks like SS ID)
    if (paper.paper_id && paper.paper_id.length > 20 && !paper.paper_id.includes('.')) {
      return `https://www.semanticscholar.org/paper/${paper.paper_id}`;
    }

    return null;
  }

  /**
   * Get all papers for export (up to maxLimit). No pagination.
   */
  async getPapersForExport(maxLimit = 10000): Promise<Paper[]> {
    const { data, error } = await this.client
      .from('papers')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .order('created_at', { ascending: false })
      .limit(maxLimit);

    if (error) {
      throw new Error(`Failed to get papers for export: ${error.message}`);
    }
    return (data || []) as Paper[];
  }

  /**
   * Get all papers with pagination - for API use
   */
  async getAllPapers(params: {
    page?: number;
    limit?: number;
  }): Promise<{ data: Paper[]; count: number }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 100);
    const offset = (page - 1) * limit;

    const { data, error, count } = await this.client
      .from('papers')
      .select('*', { count: 'exact' })
      .eq('tenant_id', this.tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get papers: ${error.message}`);
    }

    return {
      data: (data || []) as Paper[],
      count: count || 0,
    };
  }

  /**
   * Get all edges with pagination - for API use
   */
  async getAllEdges(params: {
    page?: number;
    limit?: number;
  }): Promise<{ data: Edge[]; count: number }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 100);
    const offset = (page - 1) * limit;

    const { data, error, count } = await this.client
      .from('edges')
      .select('*', { count: 'exact' })
      .eq('tenant_id', this.tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get edges: ${error.message}`);
    }

    return {
      data: (data || []) as Edge[],
      count: count || 0,
    };
  }

  /**
   * Get all insights with pagination - for API use
   */
  async getAllInsights(params: {
    page?: number;
    limit?: number;
    query?: string;
    insightType?: string;
  }): Promise<{ data: InferredInsight[]; count: number }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 100);
    const offset = (page - 1) * limit;

    let query = this.client
      .from('inferred_insights')
      .select('*', { count: 'exact' })
      .eq('tenant_id', this.tenantId);

    // Apply explicit type filter if provided (takes precedence over query)
    if (params.insightType) {
      query = query.eq('insight_type', params.insightType);
    } else if (params.query) {
      // Only apply query filter if no explicit type is provided
      // (since query also searches insight_type, they would conflict)
      const searchQuery = params.query.trim();
      const searchPattern = `%${searchQuery}%`;
      // Search in insight_type (case-insensitive partial match)
      query = query.ilike('insight_type', searchPattern);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get insights: ${error.message}`);
    }

    return {
      data: (data || []) as InferredInsight[],
      count: count || 0,
    };
  }

  /**
   * Get insight by ID - for API use
   */
  async getInsightById(insightId: number): Promise<InferredInsight | null> {
    const { data, error } = await this.client
      .from('inferred_insights')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('id', insightId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get insight: ${error.message}`);
    }

    return data as InferredInsight | null;
  }

  /**
   * Get tenant settings
   */
  async getTenantSettings(): Promise<TenantSettings | null> {
    const { data, error } = await this.client
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get tenant settings: ${error.message}`);
    }

    return data as TenantSettings | null;
  }

  /**
   * Update tenant settings
   */
  async updateTenantSettings(settings: Partial<Omit<TenantSettings, 'tenant_id' | 'created_at'>>): Promise<void> {
    const { error } = await this.client
      .from('tenant_settings')
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', this.tenantId);

    if (error) {
      throw new Error(`Failed to update tenant settings: ${error.message}`);
    }
  }

  /**
   * Create a pipeline job (tenant-scoped)
   */
  async createPipelineJob(params: {
    paper_id: string;
    status: PipelineJob['status'];
  }): Promise<PipelineJob> {
    const { data, error } = await this.client
      .from('pipeline_jobs')
      .insert({
        tenant_id: this.tenantId,
        paper_id: params.paper_id,
        status: params.status,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create pipeline job: ${error.message}`);
    }

    return data as PipelineJob;
  }

  /**
   * Update a pipeline job (tenant-scoped)
   */
  async updatePipelineJob(
    jobId: string,
    updates: Partial<Pick<PipelineJob, 'status' | 'result' | 'error'>>
  ): Promise<PipelineJob> {
    const { data, error } = await this.client
      .from('pipeline_jobs')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', this.tenantId)
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update pipeline job: ${error.message}`);
    }

    return data as PipelineJob;
  }

  /**
   * Get a pipeline job by ID (tenant-scoped)
   */
  async getPipelineJob(jobId: string): Promise<PipelineJob | null> {
    const { data, error } = await this.client
      .from('pipeline_jobs')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('id', jobId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get pipeline job: ${error.message}`);
    }

    return (data || null) as PipelineJob | null;
  }

  /**
   * List pipeline jobs (tenant-scoped)
   */
  async listPipelineJobs(params?: {
    page?: number;
    limit?: number;
    status?: PipelineJob['status'];
  }): Promise<{ data: PipelineJob[]; count: number }> {
    const page = params?.page ?? 1;
    const limit = Math.min(params?.limit ?? 20, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.client
      .from('pipeline_jobs')
      .select('*', { count: 'exact' })
      .eq('tenant_id', this.tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (params?.status) {
      query = query.eq('status', params.status);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list pipeline jobs: ${error.message}`);
    }

    return {
      data: (data || []) as PipelineJob[],
      count: count || 0,
    };
  }

  async countPipelineJobsSince(windowMs: number): Promise<number> {
    const windowStart = new Date(Date.now() - windowMs).toISOString();
    const { count, error } = await this.client
      .from('pipeline_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', this.tenantId)
      .gte('created_at', windowStart);

    if (error) {
      throw new Error(`Failed to count recent pipeline jobs: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Get tenant members
   */
  async getTenantMembers(): Promise<TenantUser[]> {
    const { data, error } = await this.client
      .from('tenant_users')
      .select('*')
      .eq('tenant_id', this.tenantId);

    if (error) {
      throw new Error(`Failed to get tenant members: ${error.message}`);
    }

    return (data || []) as TenantUser[];
  }
}

export function createDatabaseClient(tenantId: string): DatabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables'
    );
  }

  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  return new DatabaseClient(url, serviceRoleKey, tenantId);
}

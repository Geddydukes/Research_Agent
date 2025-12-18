import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Node {
  id: number;
  type: string;
  canonical_name: string;
  metadata: Record<string, unknown> | null;
  original_confidence: number | null;
  adjusted_confidence: number | null;
  review_status: 'approved' | 'flagged' | 'rejected' | null;
  review_reasons: string | null;
  created_at: string;
}

export interface Edge {
  id: number;
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
  title: string | null;
  abstract: string | null;
  year: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface PaperSection {
  id: number;
  paper_id: string;
  section_type: string;
  content: string;
  word_count: number | null;
  part_index: number;
  created_at: string;
}

export interface EntityMention {
  id: number;
  node_id: number;
  paper_id: string;
  section_type: string | null;
  mention_count: number;
  created_at: string;
}

export interface InferredInsight {
  id: number;
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

export interface InsertNode {
  type: string;
  canonical_name: string;
  metadata?: Record<string, unknown>;
  original_confidence?: number;
  adjusted_confidence?: number;
  review_status?: 'approved' | 'flagged' | 'rejected';
  review_reasons?: string;
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

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey);
  }

  async insertPaper(paper: InsertPaper): Promise<Paper> {
    const { data, error } = await this.client
      .from('papers')
      .insert(paper)
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
      .upsert(paper, { onConflict: 'paper_id' })
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
      .eq('paper_id', paperId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to check paper existence: ${error.message}`);
    }

    return data !== null;
  }

  async insertPaperSections(sections: InsertPaperSection[]): Promise<PaperSection[]> {
    if (sections.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from('paper_sections')
      .insert(sections)
      .select();

    if (error) {
      throw new Error(`Failed to insert paper sections: ${error.message}`);
    }

    return data as PaperSection[];
  }

  async insertNode(node: InsertNode): Promise<Node> {
    const { data, error } = await this.client
      .from('nodes')
      .insert(node)
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

    const { data, error } = await this.client
      .from('nodes')
      .insert(nodes)
      .select();

    if (error) {
      throw new Error(`Failed to insert nodes: ${error.message}`);
    }

    return data as Node[];
  }

  async insertEdge(edge: InsertEdge): Promise<Edge> {
    const { data, error } = await this.client
      .from('edges')
      .insert(edge)
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

    const { data, error } = await this.client
      .from('edges')
      .insert(edges)
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
      .eq('id', edgeId);

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
      .eq('id', edgeId);

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

  async insertEntityMentions(mentions: InsertEntityMention[]): Promise<EntityMention[]> {
    if (mentions.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from('entity_mentions')
      .insert(mentions)
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

    const { data, error } = await this.client
      .from('inferred_insights')
      .insert(insights)
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
      this.client.from('nodes').select('*').eq('id', edge.source_node_id).maybeSingle(),
      this.client.from('nodes').select('*').eq('id', edge.target_node_id).maybeSingle(),
      sourcePaperId
        ? this.client.from('papers').select('*').eq('paper_id', sourcePaperId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      targetPaperId
        ? this.client.from('papers').select('*').eq('paper_id', targetPaperId).maybeSingle()
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
      .eq('paper_id', paperId);

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
      this.client.from('nodes').select('*').eq('review_status', 'approved').neq('type', 'Paper'),
      this.client.from('edges').select('*').eq('review_status', 'approved'),
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
      this.client.from('nodes').select('*').in('review_status', ['flagged', 'rejected']).neq('type', 'Paper'),
      this.client.from('edges').select('*').in('review_status', ['flagged', 'rejected']),
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
      this.client.from('nodes').select('*'),
      this.client.from('edges').select('*'),
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
      .eq('id', nodeId);

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
      .eq('id', edgeId);

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
        papers (*)
      `)
      .eq('node_id', nodeId);

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
  }): Promise<{ data: InferredInsight[]; count: number }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 100);
    const offset = (page - 1) * limit;

    const { data, error, count } = await this.client
      .from('inferred_insights')
      .select('*', { count: 'exact' })
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
      .eq('id', insightId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get insight: ${error.message}`);
    }

    return data as InferredInsight | null;
  }
}

export function createDatabaseClient(): DatabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables'
    );
  }

  return new DatabaseClient(url, serviceRoleKey);
}


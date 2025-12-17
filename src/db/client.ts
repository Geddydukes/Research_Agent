import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Node {
  id: number;
  type: string;
  canonical_name: string;
  metadata: Record<string, unknown> | null;
  original_confidence: number | null;
  adjusted_confidence: number | null;
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
}

export interface InsertEdge {
  source_node_id: number;
  target_node_id: number;
  relationship_type: string;
  confidence: number;
  evidence?: string;
  provenance?: Record<string, unknown>;
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

  async getNodesForPaper(paperId: string): Promise<Node[]> {
    const { data, error } = await this.client
      .from('entity_mentions')
      .select(`
        node_id,
        nodes (*)
      `)
      .eq('paper_id', paperId);

    if (error) {
      throw new Error(`Failed to get nodes for paper: ${error.message}`);
    }

    // Extract unique nodes from the join
    const nodeMap = new Map<number, Node>();
    for (const item of data || []) {
      if (item.nodes && !nodeMap.has(item.node_id)) {
        const node = Array.isArray(item.nodes) ? item.nodes[0] : item.nodes;
        if (node) {
          nodeMap.set(item.node_id, node as Node);
        }
      }
    }

    return Array.from(nodeMap.values());
  }

  async getEdgesForPaper(paperId: string): Promise<Edge[]> {
    const nodes = await this.getNodesForPaper(paperId);
    const nodeIds = nodes.map(n => n.id);

    if (nodeIds.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from('edges')
      .select('*')
      .or(`source_node_id.in.(${nodeIds.join(',')}),target_node_id.in.(${nodeIds.join(',')})`);

    if (error) {
      throw new Error(`Failed to get edges for paper: ${error.message}`);
    }

    return (data || []) as Edge[];
  }

  async getGraphData(): Promise<{ nodes: Node[]; edges: Edge[] }> {
    const [nodesResult, edgesResult] = await Promise.all([
      this.client.from('nodes').select('*'),
      this.client.from('edges').select('*'),
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
  async getNodeById(nodeId: number): Promise<Node | null> {
    const { data, error } = await this.client
      .from('nodes')
      .select('*')
      .eq('id', nodeId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get node: ${error.message}`);
    }

    return data as Node | null;
  }

  /**
   * Get edges for a node - for API use
   */
  async getEdgesForNode(nodeId: number): Promise<Edge[]> {
    const { data, error } = await this.client
      .from('edges')
      .select('*')
      .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`);

    if (error) {
      throw new Error(`Failed to get edges: ${error.message}`);
    }

    return (data || []) as Edge[];
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


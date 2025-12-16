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
  private client: SupabaseClient;

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
      .in('source_node_id', nodeIds)
      .in('target_node_id', nodeIds);

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


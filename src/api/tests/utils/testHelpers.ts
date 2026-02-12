import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type {
  DatabaseClient,
  Node,
  Edge,
  Paper,
  PaperSection,
  InferredInsight,
} from '../../../db/client';

export class MockDatabaseClient implements Partial<DatabaseClient> {
  private papers: Map<string, Paper> = new Map();
  private nodes: Map<number, Node> = new Map();
  private edges: Map<number, Edge> = new Map();
  private sections: Map<string, PaperSection[]> = new Map();
  private insights: Map<number, InferredInsight> = new Map();
  private entityMentions: Map<string, number[]> = new Map(); // paperId -> nodeIds

  // Paper methods
  async getPaperById(paperId: string): Promise<Paper | null> {
    return this.papers.get(paperId) || null;
  }

  async getAllPapers(params: {
    page?: number;
    limit?: number;
  }): Promise<{ data: Paper[]; count: number }> {
    const allPapers = Array.from(this.papers.values());
    const page = params.page || 1;
    const limit = params.limit || 50;
    const offset = (page - 1) * limit;
    const data = allPapers.slice(offset, offset + limit);
    return { data, count: allPapers.length };
  }

  async getPaperSections(paperId: string): Promise<PaperSection[]> {
    return this.sections.get(paperId) || [];
  }

  async getNodesForPaper(paperId: string): Promise<Node[]> {
    const nodeIds = this.entityMentions.get(paperId) || [];
    return nodeIds.map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  async getEdgesForPaper(paperId: string): Promise<Edge[]> {
    const nodeIds = this.entityMentions.get(paperId) || [];
    return Array.from(this.edges.values()).filter(
      (e) => nodeIds.includes(e.source_node_id) || nodeIds.includes(e.target_node_id)
    );
  }

  // Node methods
  async getNodeById(nodeId: number): Promise<Node | null> {
    return this.nodes.get(nodeId) || null;
  }

  async getEdgesForNode(nodeId: number): Promise<Edge[]> {
    return Array.from(this.edges.values()).filter(
      (e) => e.source_node_id === nodeId || e.target_node_id === nodeId
    );
  }

  // Edge methods
  async getEdgeModal(edgeId: number): Promise<{
    edge: Edge;
    source_node: Node | null;
    target_node: Node | null;
    source_paper: Paper | null;
    target_paper: Paper | null;
  } | null> {
    const edge = this.edges.get(edgeId);
    if (!edge) return null;

    const sourceNode = this.nodes.get(edge.source_node_id) || null;
    const targetNode = this.nodes.get(edge.target_node_id) || null;

    // Find papers that mention these nodes
    let sourcePaper: Paper | null = null;
    let targetPaper: Paper | null = null;

    for (const [paperId, nodeIds] of this.entityMentions.entries()) {
      if (nodeIds.includes(edge.source_node_id) && !sourcePaper) {
        sourcePaper = this.papers.get(paperId) || null;
      }
      if (nodeIds.includes(edge.target_node_id) && !targetPaper) {
        targetPaper = this.papers.get(paperId) || null;
      }
    }

    return {
      edge,
      source_node: sourceNode,
      target_node: targetNode,
      source_paper: sourcePaper,
      target_paper: targetPaper,
    };
  }

  async getInsightsForEdge(edgeId: number): Promise<InferredInsight[]> {
    const edge = this.edges.get(edgeId);
    if (!edge) return [];

    return Array.from(this.insights.values()).filter((insight) =>
      insight.subject_nodes.includes(edge.source_node_id) ||
      insight.subject_nodes.includes(edge.target_node_id)
    );
  }

  async getAllEdges(params: {
    page?: number;
    limit?: number;
  }): Promise<{ data: Edge[]; count: number }> {
    const allEdges = Array.from(this.edges.values());
    const page = params.page || 1;
    const limit = params.limit || 50;
    const offset = (page - 1) * limit;
    const data = allEdges.slice(offset, offset + limit);
    return { data, count: allEdges.length };
  }

  async getAllInsights(params: {
    page?: number;
    limit?: number;
  }): Promise<{ data: InferredInsight[]; count: number }> {
    const allInsights = Array.from(this.insights.values());
    const page = params.page || 1;
    const limit = params.limit || 50;
    const offset = (page - 1) * limit;
    const data = allInsights.slice(offset, offset + limit);
    return { data, count: allInsights.length };
  }

  async getInsightById(insightId: number): Promise<InferredInsight | null> {
    return this.insights.get(insightId) || null;
  }

  async getGraphData(): Promise<{ nodes: Node[]; edges: Edge[] }> {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  // Search methods (simplified for testing)
  async searchPapers(query: string, limit: number): Promise<Paper[]> {
    const searchLower = query.toLowerCase();
    return Array.from(this.papers.values())
      .filter(
        (p) =>
          p.title?.toLowerCase().includes(searchLower) ||
          p.abstract?.toLowerCase().includes(searchLower) ||
          p.paper_id.toLowerCase().includes(searchLower)
      )
      .slice(0, limit);
  }

  async searchNodes(query: string, limit: number): Promise<Node[]> {
    const searchLower = query.toLowerCase();
    return Array.from(this.nodes.values())
      .filter((n) => n.canonical_name.toLowerCase().includes(searchLower))
      .slice(0, limit);
  }

  // Stats methods
  async getStatsData(): Promise<{
    papersCount: number;
    nodesCount: number;
    edgesCount: number;
    insightsCount: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
  }> {
    const nodesByType: Record<string, number> = {};
    for (const node of this.nodes.values()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    const edgesByType: Record<string, number> = {};
    for (const edge of this.edges.values()) {
      edgesByType[edge.relationship_type] =
        (edgesByType[edge.relationship_type] || 0) + 1;
    }

    return {
      papersCount: this.papers.size,
      nodesCount: this.nodes.size,
      edgesCount: this.edges.size,
      insightsCount: this.insights.size,
      nodesByType,
      edgesByType,
    };
  }

  // Test data setup methods
  addPaper(paper: Paper): void {
    this.papers.set(paper.paper_id, paper);
  }

  addNode(node: Node): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: Edge): void {
    this.edges.set(edge.id, edge);
  }

  addSection(section: PaperSection): void {
    const sections = this.sections.get(section.paper_id) || [];
    sections.push(section);
    this.sections.set(section.paper_id, sections);
  }

  addInsight(insight: InferredInsight): void {
    this.insights.set(insight.id, insight);
  }

  linkPaperToNodes(paperId: string, nodeIds: number[]): void {
    this.entityMentions.set(paperId, nodeIds);
  }

  clear(): void {
    this.papers.clear();
    this.nodes.clear();
    this.edges.clear();
    this.sections.clear();
    this.insights.clear();
    this.entityMentions.clear();
  }
}

export async function createTestServer(
  mockDb: MockDatabaseClient
): Promise<FastifyInstance> {
  // Create a test server with mocked database
  const cors = require('@fastify/cors');
  const { errorHandler } = require('../../middleware');
  const routes = require('../../routes');

  const fastify = Fastify({
    logger: false, // Disable logging in tests
  });

  await fastify.register(cors, {
    origin: '*',
    credentials: true,
  });

  fastify.setErrorHandler(errorHandler);

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register all routes with mock database
  routes.registerPapersRoutes(fastify, mockDb as any);
  routes.registerGraphRoutes(fastify, mockDb as any);
  routes.registerEdgesRoutes(fastify, mockDb as any);
  routes.registerSearchRoutes(fastify, mockDb as any);
  routes.registerInsightsRoutes(fastify, mockDb as any);
  routes.registerStatsRoutes(fastify, mockDb as any);
  routes.registerPipelineRoutes(fastify);

  await fastify.ready();
  return fastify;
}

export function createMockData() {
  const mockDb = new MockDatabaseClient();
  const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

  // Create test papers
  const paper1: Paper = {
    paper_id: 'test-paper-1',
    tenant_id: DEFAULT_TENANT_ID,
    title: 'Test Paper 1',
    abstract: 'This is a test paper',
    year: 2023,
    metadata: { authors: ['Author 1'] },
    embedding: null,
    created_at: new Date().toISOString(),
  };

  const paper2: Paper = {
    paper_id: 'test-paper-2',
    tenant_id: DEFAULT_TENANT_ID,
    title: 'Test Paper 2',
    abstract: 'Another test paper',
    year: 2024,
    metadata: { authors: ['Author 2'] },
    embedding: null,
    created_at: new Date().toISOString(),
  };

  // Create test nodes
  const node1: Node = {
    id: 1,
    tenant_id: DEFAULT_TENANT_ID,
    type: 'method',
    canonical_name: 'Test Method',
    metadata: { description: 'A test method' },
    original_confidence: 0.9,
    adjusted_confidence: 0.85,
    review_status: 'approved',
    review_reasons: null,
    embedding_raw: null,
    embedding_index: null,
    created_at: new Date().toISOString(),
  };

  const node2: Node = {
    id: 2,
    tenant_id: DEFAULT_TENANT_ID,
    type: 'dataset',
    canonical_name: 'Test Dataset',
    metadata: { description: 'A test dataset' },
    original_confidence: 0.8,
    adjusted_confidence: 0.75,
    review_status: 'approved',
    review_reasons: null,
    embedding_raw: null,
    embedding_index: null,
    created_at: new Date().toISOString(),
  };

  const node3: Node = {
    id: 3,
    tenant_id: DEFAULT_TENANT_ID,
    type: 'metric',
    canonical_name: 'Accuracy',
    metadata: { description: 'Accuracy metric' },
    original_confidence: 0.95,
    adjusted_confidence: 0.9,
    review_status: 'approved',
    review_reasons: null,
    embedding_raw: null,
    embedding_index: null,
    created_at: new Date().toISOString(),
  };

  // Create test edges
  const edge1: Edge = {
    id: 1,
    tenant_id: DEFAULT_TENANT_ID,
    source_node_id: 1,
    target_node_id: 2,
    relationship_type: 'uses',
    confidence: 0.9,
    evidence: 'Paper mentions using this dataset',
    provenance: { source_paper_id: 'test-paper-1' },
    review_status: 'approved',
    review_reasons: null,
    created_at: new Date().toISOString(),
  };

  const edge2: Edge = {
    id: 2,
    tenant_id: DEFAULT_TENANT_ID,
    source_node_id: 1,
    target_node_id: 3,
    relationship_type: 'evaluates_with',
    confidence: 0.85,
    evidence: 'Method evaluated with accuracy',
    provenance: { source_paper_id: 'test-paper-1' },
    review_status: 'approved',
    review_reasons: null,
    created_at: new Date().toISOString(),
  };

  // Create test sections
  const section1: PaperSection = {
    id: 1,
    tenant_id: DEFAULT_TENANT_ID,
    paper_id: 'test-paper-1',
    section_type: 'abstract',
    content: 'This is the abstract content',
    word_count: 10,
    part_index: 0,
    created_at: new Date().toISOString(),
  };

  // Create test insights
  const insight1: InferredInsight = {
    id: 1,
    tenant_id: DEFAULT_TENANT_ID,
    insight_type: 'comparison',
    subject_nodes: [1, 2],
    reasoning_path: { steps: ['step1', 'step2'] },
    confidence: 0.8,
    created_at: new Date().toISOString(),
  };

  // Add to mock database
  mockDb.addPaper(paper1);
  mockDb.addPaper(paper2);
  mockDb.addNode(node1);
  mockDb.addNode(node2);
  mockDb.addNode(node3);
  mockDb.addEdge(edge1);
  mockDb.addEdge(edge2);
  mockDb.addSection(section1);
  mockDb.addInsight(insight1);
  mockDb.linkPaperToNodes('test-paper-1', [1, 2, 3]);
  mockDb.linkPaperToNodes('test-paper-2', [1]);

  return mockDb;
}

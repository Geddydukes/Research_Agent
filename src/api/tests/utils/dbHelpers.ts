import 'dotenv/config';
import { createDatabaseClient, DatabaseClient } from '../../../db/client';
import type { Paper, Node, Edge, PaperSection, InferredInsight } from '../../../db/client';

/**
 * Helper to create test data in the real database
 * Returns cleanup function to remove test data
 */
export async function createTestData(): Promise<{
  papers: Paper[];
  nodes: Node[];
  edges: Edge[];
  sections: PaperSection[];
  insights: InferredInsight[];
  cleanup: () => Promise<void>;
}> {
  const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';
  const db = createDatabaseClient(DEFAULT_TENANT_ID);
  const testPrefix = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  // Create test papers
  const paper1 = await db.insertPaper({
    paper_id: `${testPrefix}-paper-1`,
    title: 'Test Paper 1',
    abstract: 'This is a test paper',
    year: 2023,
    metadata: { authors: ['Author 1'] },
  });

  const paper2 = await db.insertPaper({
    paper_id: `${testPrefix}-paper-2`,
    title: 'Test Paper 2',
    abstract: 'Another test paper',
    year: 2024,
    metadata: { authors: ['Author 2'] },
  });

  // Create test nodes
  const node1 = await db.insertNode({
    type: 'method',
    canonical_name: `${testPrefix}-Test Method`,
    metadata: { description: 'A test method' },
    original_confidence: 0.9,
    adjusted_confidence: 0.85,
    review_status: 'approved',
  });

  const node2 = await db.insertNode({
    type: 'dataset',
    canonical_name: `${testPrefix}-Test Dataset`,
    metadata: { description: 'A test dataset' },
    original_confidence: 0.8,
    adjusted_confidence: 0.75,
    review_status: 'approved',
  });

  const node3 = await db.insertNode({
    type: 'metric',
    canonical_name: `${testPrefix}-Accuracy`,
    metadata: { description: 'Accuracy metric' },
    original_confidence: 0.95,
    adjusted_confidence: 0.9,
    review_status: 'approved',
  });

  // Create test sections
  const section1 = await db.insertPaperSections([
    {
      paper_id: paper1.paper_id,
      section_type: 'abstract',
      content: 'This is the abstract content',
      word_count: 10,
      part_index: 0,
    },
  ]);

  // Link nodes to papers via entity mentions
  await db.insertEntityMentions([
    { node_id: node1.id, paper_id: paper1.paper_id, section_type: 'abstract' },
    { node_id: node2.id, paper_id: paper1.paper_id, section_type: 'abstract' },
    { node_id: node3.id, paper_id: paper1.paper_id, section_type: 'abstract' },
    { node_id: node1.id, paper_id: paper2.paper_id },
  ]);

  // Create test edges
  const edge1 = await db.insertEdge({
    source_node_id: node1.id,
    target_node_id: node2.id,
    relationship_type: 'uses',
    confidence: 0.9,
    evidence: 'Paper mentions using this dataset',
    provenance: { source_paper_id: paper1.paper_id },
    review_status: 'approved',
  });

  const edge2 = await db.insertEdge({
    source_node_id: node1.id,
    target_node_id: node3.id,
    relationship_type: 'evaluates_with',
    confidence: 0.85,
    evidence: 'Method evaluated with accuracy',
    provenance: { source_paper_id: paper1.paper_id },
    review_status: 'approved',
  });

  // Create test insights
  const insight1 = await db.insertInsights([
    {
      insight_type: 'comparison',
      subject_nodes: [node1.id, node2.id],
      reasoning_path: { steps: ['step1', 'step2'] },
      confidence: 0.8,
    },
  ]);

  const cleanup = async () => {
    try {
      // Delete in reverse order of dependencies
      // Insights first (no dependencies)
      for (const insight of insight1) {
        await (db as any).client
          .from('inferred_insights')
          .delete()
          .eq('id', insight.id);
      }

      // Then edges
      await (db as any).client
        .from('edges')
        .delete()
        .in('id', [edge1.id, edge2.id]);

      // Then entity mentions
      await (db as any).client
        .from('entity_mentions')
        .delete()
        .in('paper_id', [paper1.paper_id, paper2.paper_id]);

      // Then sections
      for (const section of section1) {
        await (db as any).client
          .from('paper_sections')
          .delete()
          .eq('id', section.id);
      }

      // Then nodes
      await (db as any).client
        .from('nodes')
        .delete()
        .in('id', [node1.id, node2.id, node3.id]);

      // Finally papers
      await (db as any).client
        .from('papers')
        .delete()
        .in('paper_id', [paper1.paper_id, paper2.paper_id]);
    } catch (error) {
      console.error('Error cleaning up test data:', error);
      // Don't throw - cleanup errors shouldn't fail tests
    }
  };

  return {
    papers: [paper1, paper2],
    nodes: [node1, node2, node3],
    edges: [edge1, edge2],
    sections: section1,
    insights: insight1,
    cleanup,
  };
}

/**
 * Create a test server with real database
 */
export async function createTestServerWithRealDb(): Promise<{
  server: any;
  db: DatabaseClient;
  testData: Awaited<ReturnType<typeof createTestData>>;
  cleanup: () => Promise<void>;
}> {
  const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';
  const db = createDatabaseClient(DEFAULT_TENANT_ID);
  const testData = await createTestData();

  const cors = require('@fastify/cors');
  const { errorHandler } = require('../../middleware');
  const routes = require('../../routes');

  const Fastify = require('fastify');
  const fastify = Fastify({
    logger: false,
  });

  await fastify.register(cors, {
    origin: '*',
    credentials: true,
  });

  fastify.setErrorHandler(errorHandler);

  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  routes.registerPapersRoutes(fastify, db);
  routes.registerGraphRoutes(fastify, db);
  routes.registerEdgesRoutes(fastify, db);
  routes.registerSearchRoutes(fastify, db);
  routes.registerInsightsRoutes(fastify, db);
  routes.registerStatsRoutes(fastify, db);
  routes.registerPipelineRoutes(fastify);

  await fastify.ready();

  return {
    server: fastify,
    db,
    testData,
    cleanup: testData.cleanup,
  };
}

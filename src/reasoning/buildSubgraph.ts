import { DatabaseClient } from '../db/client';

interface SubgraphInput {
  nodes: Array<{
    id: string;
    type: string;
    canonical_name: string;
    metadata: Record<string, unknown> | null;
  }>;
  edges: Array<{
    id: string;
    source_node_id: string;
    target_node_id: string;
    relationship_type: string;
    confidence: number;
    evidence: string | null;
  }>;
  papers: Array<{
    paper_id: string;
    title: string | null;
    year: number | null;
  }>;
  total_papers_in_corpus: number;
}

interface SubgraphScope {
  paper_ids: string[];
  depth: number;
}

export async function buildSubgraph(
  db: DatabaseClient,
  affectedPaperIds: string[],
  depth: number = 2,
  fullGraph: boolean = false,
  logger?: { info: (msg: string, ctx?: Record<string, unknown>) => void }
): Promise<{ input: SubgraphInput; scope: SubgraphScope }> {
  if (fullGraph || process.env.REASON_FULL_GRAPH === '1') {
    const graphData = await db.getGraphData();
    const papers = await db.client
      .from('papers')
      .select('paper_id, title, year')
      .then((r) => (r.data || []) as Array<{ paper_id: string; title: string | null; year: number | null }>);

    return {
      input: {
        nodes: graphData.nodes.map((n) => ({
          id: n.id.toString(),
          type: n.type,
          canonical_name: n.canonical_name,
          metadata: n.metadata,
        })),
        edges: graphData.edges.map((e) => ({
          id: e.id.toString(),
          source_node_id: e.source_node_id.toString(),
          target_node_id: e.target_node_id.toString(),
          relationship_type: e.relationship_type,
          confidence: e.confidence,
          evidence: e.evidence || null,
        })),
        papers: papers.map((p) => ({
          paper_id: p.paper_id,
          title: p.title,
          year: p.year,
        })),
        total_papers_in_corpus: papers.length,
      },
      scope: {
        paper_ids: affectedPaperIds,
        depth: 0,
      },
    };
  }

  const nodeIds = new Set<number>();
  const edgeIds = new Set<number>();
  const paperIds = new Set<string>(affectedPaperIds);

  const fetchStart = Date.now();
  const paperFetches = affectedPaperIds.map(async (paperId) => {
    const [paperNodes, edges] = await Promise.all([
      db.getNodesForPaper(paperId),
      db.getEdgesForPaper(paperId),
    ]);
    return { paperId, nodes: paperNodes, edges };
  });

  const paperResults = await Promise.all(paperFetches);
  for (const { nodes, edges } of paperResults) {
    for (const node of nodes) {
      nodeIds.add(node.id);
    }
    for (const edge of edges) {
      edgeIds.add(edge.id);
      nodeIds.add(edge.source_node_id);
      nodeIds.add(edge.target_node_id);
    }
  }

  for (let d = 1; d <= depth; d++) {
    if (nodeIds.size === 0) break;

    const nodeIdArray = Array.from(nodeIds);
    if (nodeIdArray.length === 0) break;

    const [sourceEdgesResult, targetEdgesResult] = await Promise.all([
      db.client
        .from('edges')
        .select('source_node_id, target_node_id, id')
        .in('source_node_id', nodeIdArray)
        .then((r) => (r.data || []) as Array<{ source_node_id: number; target_node_id: number; id: number }>),
      db.client
        .from('edges')
        .select('source_node_id, target_node_id, id')
        .in('target_node_id', nodeIdArray)
        .then((r) => (r.data || []) as Array<{ source_node_id: number; target_node_id: number; id: number }>),
    ]);

    const sourceEdges = sourceEdgesResult;
    const targetEdges = targetEdgesResult;

    const allConnected = [...sourceEdges, ...targetEdges];
    const seenEdgeIds = new Set<number>();

    for (const e of allConnected) {
      if (!seenEdgeIds.has(e.id)) {
        seenEdgeIds.add(e.id);
        if (!edgeIds.has(e.id)) {
          edgeIds.add(e.id);
          nodeIds.add(e.source_node_id);
          nodeIds.add(e.target_node_id);
        }
      }
    }
  }

  const fetchDuration = Date.now() - fetchStart;
  if (logger) {
    logger.info(`[buildSubgraph] Initial fetch: ${fetchDuration}ms for ${affectedPaperIds.length} papers`);
  }

  const nodeIdArray = Array.from(nodeIds);
  const edgeIdArray = Array.from(edgeIds);
  const paperIdArray = Array.from(paperIds);

  const [nodesResult, edgesResult, papersResult, totalPapersResult] = await Promise.all([
    nodeIdArray.length > 0
      ? db.client
          .from('nodes')
          .select('*')
          .in('id', nodeIdArray)
          .then((r) => (r.data || []) as any[])
      : Promise.resolve([]),
    edgeIdArray.length > 0
      ? db.client
          .from('edges')
          .select('*')
          .in('id', edgeIdArray)
          .then((r) => (r.data || []) as any[])
      : Promise.resolve([]),
    paperIdArray.length > 0
      ? db.client
          .from('papers')
          .select('paper_id, title, year')
          .in('paper_id', paperIdArray)
          .then((r) => (r.data || []) as Array<{ paper_id: string; title: string | null; year: number | null }>)
      : Promise.resolve([]),
    db.client
      .from('papers')
      .select('*', { count: 'exact', head: true })
      .then((r) => r.count || 0),
  ]);

  const nodes = nodesResult;
  const edges = edgesResult;
  const papers = papersResult;

  const totalFetchDuration = Date.now() - fetchStart;
  if (logger) {
    logger.info(`[buildSubgraph] Total fetch: ${totalFetchDuration}ms (${nodes.length} nodes, ${edges.length} edges, ${papers.length} papers)`);
  }

  return {
    input: {
      nodes: nodes.map((n) => ({
        id: n.id.toString(),
        type: n.type,
        canonical_name: n.canonical_name,
        metadata: n.metadata,
      })),
      edges: edges.map((e) => ({
        id: e.id.toString(),
        source_node_id: e.source_node_id.toString(),
        target_node_id: e.target_node_id.toString(),
        relationship_type: e.relationship_type,
        confidence: e.confidence,
        evidence: e.evidence || null,
      })),
      papers: papers.map((p) => ({
        paper_id: p.paper_id,
        title: p.title,
        year: p.year,
      })),
      total_papers_in_corpus: totalPapersResult,
    },
    scope: {
      paper_ids: Array.from(paperIds),
      depth,
    },
  };
}

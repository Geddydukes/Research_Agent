import 'dotenv/config';
import { createDatabaseClient, type Node } from '../src/db/client';
import { validateEntitiesAndEdges } from '../src/agents/validationRules';
import type { EntityOutput, EdgeOutput } from '../src/agents/schemas';
import { canonicalize } from '../src/utils/canonicalize';

const logger = {
  error: (msg: string, ctx?: Record<string, unknown>) => console.error(`[Rescore] ${msg}`, ctx || ''),
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(`[Rescore] ${msg}`, ctx || ''),
  info: (msg: string, ctx?: Record<string, unknown>) => console.info(`[Rescore] ${msg}`, ctx || ''),
};

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  const db = createDatabaseClient();
  
  logger.info('Fetching all nodes and edges from database (regardless of review_status)...');
  const { nodes, edges } = await db.getAllGraphData();
  
  logger.info(`Found ${nodes.length} nodes and ${edges.length} edges`);
  
  // Sort nodes and edges by ID for deterministic processing
  const sortedNodes = [...nodes].sort((a, b) => a.id - b.id);
  const sortedEdges = [...edges].sort((a, b) => a.id - b.id);

  // Build a map of node ID to canonical name for edge conversion
  // Use canonicalize to match validation's canonicalization
  const nodeIdToCanonical = new Map<number, string>();
  const nodeIdToNode = new Map<number, Node>();
  for (const node of sortedNodes) {
    const canonicalKey = canonicalize(node.canonical_name);
    nodeIdToCanonical.set(node.id, canonicalKey);
    nodeIdToNode.set(node.id, node);
  }

  // Convert nodes to EntityOutput format (sorted by canonical_name for deterministic processing)
  const entities: EntityOutput['entities'] = sortedNodes
    .filter((node) => node.type !== 'Paper') // Exclude Paper nodes from validation
    .sort((a, b) => {
      // Sort by canonical_name for deterministic validation
      const nameCompare = a.canonical_name.localeCompare(b.canonical_name);
      if (nameCompare !== 0) return nameCompare;
      return a.type.localeCompare(b.type);
    })
    .map((node) => ({
      type: node.type,
      canonical_name: node.canonical_name,
      original_confidence: node.original_confidence ?? 0.5, // Default if missing
      adjusted_confidence: node.adjusted_confidence ?? node.original_confidence ?? 0.5,
      metadata: node.metadata || {},
    }));

  // Convert edges to EdgeOutput format (sorted by source, then target, then relationship_type)
  const edgesForValidation: EdgeOutput['edges'] = sortedEdges
    .sort((a, b) => {
      const sourceA = nodeIdToCanonical.get(a.source_node_id) || '';
      const sourceB = nodeIdToCanonical.get(b.source_node_id) || '';
      const sourceCompare = sourceA.localeCompare(sourceB);
      if (sourceCompare !== 0) return sourceCompare;
      
      const targetA = nodeIdToCanonical.get(a.target_node_id) || '';
      const targetB = nodeIdToCanonical.get(b.target_node_id) || '';
      const targetCompare = targetA.localeCompare(targetB);
      if (targetCompare !== 0) return targetCompare;
      
      return a.relationship_type.localeCompare(b.relationship_type);
    })
    .map((edge) => {
    const sourceCanonical = nodeIdToCanonical.get(edge.source_node_id);
    const targetCanonical = nodeIdToCanonical.get(edge.target_node_id);

    if (!sourceCanonical || !targetCanonical) {
      logger.warn('Edge references missing node', {
        edgeId: edge.id,
        sourceNodeId: edge.source_node_id,
        targetNodeId: edge.target_node_id,
      });
      // Use placeholder - validation will catch this as unknown_endpoint
      return {
        source_canonical_name: sourceCanonical || `__missing_${edge.source_node_id}__`,
        target_canonical_name: targetCanonical || `__missing_${edge.target_node_id}__`,
        source_type: 'unknown',
        target_type: 'unknown',
        relationship_type: edge.relationship_type,
        confidence: edge.confidence,
        evidence: edge.evidence || '',
        provenance: edge.provenance || {},
      };
    }

    // Find source and target node types
    const sourceNode = nodeIdToNode.get(edge.source_node_id);
    const targetNode = nodeIdToNode.get(edge.target_node_id);

    return {
      source_canonical_name: sourceCanonical,
      target_canonical_name: targetCanonical,
      source_type: sourceNode?.type || 'unknown',
      target_type: targetNode?.type || 'unknown',
      relationship_type: edge.relationship_type,
      confidence: edge.confidence,
      evidence: edge.evidence || '',
      provenance: edge.provenance || {},
    };
  });

  logger.info('Running validation...');
  const validated = validateEntitiesAndEdges(entities, edgesForValidation);

  // Build stats
  const entityStats = { approved: 0, flagged: 0, rejected: 0 };
  const edgeStats = { approved: 0, flagged: 0, rejected: 0 };

  for (const e of validated.validated_entities) {
    entityStats[e.decision]++;
  }

  for (const e of validated.validated_edges) {
    edgeStats[e.decision]++;
  }

  logger.info('Validation results:');
  logger.info(`  Entities: ${entityStats.approved} approved, ${entityStats.flagged} flagged, ${entityStats.rejected} rejected`);
  logger.info(`  Edges: ${edgeStats.approved} approved, ${edgeStats.flagged} flagged, ${edgeStats.rejected} rejected`);

  // Create maps for lookup (sorted for deterministic processing)
  const validatedEntityMap = new Map<string, typeof validated.validated_entities[0]>();
  for (const ve of validated.validated_entities) {
    const key = `${ve.canonical_name}::${ve.type}`;
    validatedEntityMap.set(key, ve);
  }

  const validatedEdgeMap = new Map<string, typeof validated.validated_edges[0]>();
  for (const ve of validated.validated_edges) {
    const key = `${ve.source_canonical_name}::${ve.relationship_type}::${ve.target_canonical_name}`;
    validatedEdgeMap.set(key, ve);
  }

  // Update nodes with new validation status and adjusted confidence
  logger.info('Updating node review status and adjusted confidence in database...');
  const nodeUpdates: Array<{
    nodeId: number;
    reviewStatus: 'approved' | 'flagged' | 'rejected';
    reviewReasons?: string;
    adjustedConfidence?: number;
  }> = [];

  for (const node of sortedNodes) {
    if (node.type === 'Paper') {
      // Paper nodes are always approved, skip validation
      continue;
    }

    // Use canonicalized name to match validation output
    const canonicalKey = canonicalize(node.canonical_name);
    const key = `${canonicalKey}::${node.type}`;
    const validatedEntity = validatedEntityMap.get(key);

    if (!validatedEntity) {
      logger.warn('No validation result found for node', { nodeId: node.id, canonical_name: node.canonical_name, type: node.type });
      continue;
    }

    nodeUpdates.push({
      nodeId: node.id,
      reviewStatus: validatedEntity.decision,
      reviewReasons: validatedEntity.reason || undefined,
      adjustedConfidence: validatedEntity.adjusted_confidence,
    });
  }

  logger.info(`Updating ${nodeUpdates.length} nodes...`);
  
  // Batch update nodes in chunks
  const BATCH_SIZE = 100;
  for (let i = 0; i < nodeUpdates.length; i += BATCH_SIZE) {
    const batch = nodeUpdates.slice(i, i + BATCH_SIZE);
    await db.updateNodesReviewStatus(batch);
    logger.info(`Updated nodes batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(nodeUpdates.length / BATCH_SIZE)}`);
  }

  // Update edges with new validation status
  logger.info('Updating edge review status in database...');
  const edgeUpdates: Array<{
    edgeId: number;
    reviewStatus: 'approved' | 'flagged' | 'rejected';
    reviewReasons?: string;
  }> = [];

  for (const edge of sortedEdges) {
    const sourceCanonical = nodeIdToCanonical.get(edge.source_node_id);
    const targetCanonical = nodeIdToCanonical.get(edge.target_node_id);

    if (!sourceCanonical || !targetCanonical) {
      logger.warn('Skipping edge with missing node reference', { edgeId: edge.id });
      continue;
    }

    const key = `${sourceCanonical}::${edge.relationship_type}::${targetCanonical}`;
    const validatedEdge = validatedEdgeMap.get(key);

    if (!validatedEdge) {
      logger.warn('No validation result found for edge', { edgeId: edge.id, key });
      continue;
    }

    edgeUpdates.push({
      edgeId: edge.id,
      reviewStatus: validatedEdge.decision,
      reviewReasons: validatedEdge.reason || undefined,
    });
  }

  logger.info(`Updating ${edgeUpdates.length} edges...`);
  
  // Batch update edges in chunks
  for (let i = 0; i < edgeUpdates.length; i += BATCH_SIZE) {
    const batch = edgeUpdates.slice(i, i + BATCH_SIZE);
    await db.updateEdgesReviewStatus(batch);
    logger.info(`Updated edges batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(edgeUpdates.length / BATCH_SIZE)}`);
  }

  logger.info('Rescoring complete!');
  
  // Summary of changes
  logger.info(`Updated review status for ${nodeUpdates.length} nodes and ${edgeUpdates.length} edges`);
}

main().catch((error) => {
  logger.error('Rescoring failed', { error: error.message, stack: error.stack });
  process.exit(1);
});

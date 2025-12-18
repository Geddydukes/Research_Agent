import 'dotenv/config';
import { createDatabaseClient } from '../src/db/client';

const logger = {
  error: (msg: string, ctx?: Record<string, unknown>) => console.error(`[Verify] ${msg}`, ctx || ''),
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(`[Verify] ${msg}`, ctx || ''),
  info: (msg: string, ctx?: Record<string, unknown>) => console.info(`[Verify] ${msg}`, ctx || ''),
};

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  const db = createDatabaseClient();
  
  logger.info('Running post-deduplication sanity checks...');

  // 1. Check for orphaned edges (source or target pointing to non-existent nodes)
  logger.info('1. Checking for orphaned edges...');
  const { data: orphanedEdges, error: edgeError } = await db.client
    .from('edges')
    .select('id, source_node_id, target_node_id, relationship_type')
    .then(async (result) => {
      if (result.error) return result;
      
      // Get all node IDs
      const { data: allNodes } = await db.client
        .from('nodes')
        .select('id');
      
      const nodeIds = new Set((allNodes || []).map(n => n.id));
      
      // Filter edges where source or target doesn't exist
      const orphaned = (result.data || []).filter(edge => 
        !nodeIds.has(edge.source_node_id) || !nodeIds.has(edge.target_node_id)
      );
      
      return { data: orphaned, error: null };
    });

  if (edgeError) {
    logger.error('Failed to check orphaned edges', { error: edgeError.message });
    throw edgeError;
  }

  if (orphanedEdges && orphanedEdges.length > 0) {
    logger.error(`❌ FAILED: Found ${orphanedEdges.length} orphaned edges!`, {
      sample: orphanedEdges.slice(0, 5),
    });
    process.exit(1);
  } else {
    logger.info(`✓ PASSED: No orphaned edges found`);
  }

  // 2. Check for orphaned entity_mentions
  logger.info('2. Checking for orphaned entity_mentions...');
  const { data: orphanedMentions, error: mentionError } = await db.client
    .from('entity_mentions')
    .select('id, node_id, paper_id')
    .then(async (result) => {
      if (result.error) return result;
      
      // Get all node IDs
      const { data: allNodes } = await db.client
        .from('nodes')
        .select('id');
      
      const nodeIds = new Set((allNodes || []).map(n => n.id));
      
      // Filter mentions where node_id doesn't exist
      const orphaned = (result.data || []).filter(mention => 
        !nodeIds.has(mention.node_id)
      );
      
      return { data: orphaned, error: null };
    });

  if (mentionError) {
    logger.error('Failed to check orphaned mentions', { error: mentionError.message });
    throw mentionError;
  }

  if (orphanedMentions && orphanedMentions.length > 0) {
    logger.error(`❌ FAILED: Found ${orphanedMentions.length} orphaned entity_mentions!`, {
      sample: orphanedMentions.slice(0, 5),
    });
    process.exit(1);
  } else {
    logger.info(`✓ PASSED: No orphaned entity_mentions found`);
  }

  // 3. Check node count
  logger.info('3. Checking node counts...');
  const { count: nodeCount, error: nodeCountError } = await db.client
    .from('nodes')
    .select('*', { count: 'exact', head: true });

  if (nodeCountError) {
    logger.error('Failed to count nodes', { error: nodeCountError.message });
    throw nodeCountError;
  }

  logger.info(`✓ Current node count: ${nodeCount || 0}`);

  // 4. Check for duplicate edges (same source, target, relationship_type)
  logger.info('4. Checking for duplicate edges...');
  const { data: allEdges, error: edgesError } = await db.client
    .from('edges')
    .select('id, source_node_id, target_node_id, relationship_type');

  if (edgesError) {
    logger.error('Failed to fetch edges', { error: edgesError.message });
    throw edgesError;
  }

  const edgeGroups = new Map<string, number[]>();
  for (const edge of allEdges || []) {
    const key = `${edge.source_node_id}::${edge.target_node_id}::${edge.relationship_type}`;
    if (!edgeGroups.has(key)) {
      edgeGroups.set(key, []);
    }
    edgeGroups.get(key)!.push(edge.id);
  }

  const duplicateEdges: number[] = [];
  for (const [, edgeIds] of edgeGroups) {
    if (edgeIds.length > 1) {
      duplicateEdges.push(...edgeIds.slice(1));
    }
  }

  if (duplicateEdges.length > 0) {
    logger.warn(`⚠ WARNING: Found ${duplicateEdges.length} duplicate edges (this may be expected if dedupe hasn't run yet)`);
    logger.info(`   Sample duplicate edge IDs: ${duplicateEdges.slice(0, 5).join(', ')}`);
  } else {
    logger.info(`✓ PASSED: No duplicate edges found`);
  }

  // 5. Check edge count
  logger.info('5. Checking edge counts...');
  const { count: edgeCount, error: edgeCountError } = await db.client
    .from('edges')
    .select('*', { count: 'exact', head: true });

  if (edgeCountError) {
    logger.error('Failed to count edges', { error: edgeCountError.message });
    throw edgeCountError;
  }

  logger.info(`✓ Current edge count: ${edgeCount || 0}`);

  // 6. Check for nodes with review_status distribution
  logger.info('6. Checking review_status distribution...');
  const { data: reviewStatusData, error: reviewError } = await db.client
    .from('nodes')
    .select('review_status');

  if (reviewError) {
    logger.error('Failed to check review_status', { error: reviewError.message });
    throw reviewError;
  }

  const statusCounts: Record<string, number> = {};
  for (const node of reviewStatusData || []) {
    const status = node.review_status || 'null';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  logger.info(`✓ Review status distribution:`, statusCounts);

  logger.info('');
  logger.info('✅ All sanity checks completed!');
  logger.info('');
  logger.info('Summary:');
  logger.info(`  - Nodes: ${nodeCount || 0}`);
  logger.info(`  - Edges: ${edgeCount || 0}`);
  logger.info(`  - Orphaned edges: 0`);
  logger.info(`  - Orphaned mentions: 0`);
  logger.info(`  - Duplicate edges: ${duplicateEdges.length}`);
}

main().catch((error) => {
  logger.error('Verification failed', { error: error.message, stack: error.stack });
  process.exit(1);
});

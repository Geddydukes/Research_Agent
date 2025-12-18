import 'dotenv/config';
import { createDatabaseClient } from '../src/db/client';
import { canonicalize } from '../src/utils/canonicalize';
import * as fs from 'fs';
import * as path from 'path';

const logger = {
  error: (msg: string, ctx?: Record<string, unknown>) => console.error(`[Dedupe] ${msg}`, ctx || ''),
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(`[Dedupe] ${msg}`, ctx || ''),
  info: (msg: string, ctx?: Record<string, unknown>) => console.info(`[Dedupe] ${msg}`, ctx || ''),
};

const DRY_RUN = process.env.DRY_RUN === 'true';
const CONFIRM = process.env.DEDUPE_CONFIRM === 'YES';

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * Union-Find data structure to find ultimate winners
 * Handles transitive merges: if A->B and B->C, then A->C
 */
class UnionFind {
  private parent: Map<number, number> = new Map();
  private nodeData: Map<number, { adjusted: number; original: number; id: number }> = new Map();

  constructor(nodes: Array<{ id: number; adjusted_confidence?: number | null; original_confidence?: number | null }>) {
    for (const node of nodes) {
      this.parent.set(node.id, node.id);
      this.nodeData.set(node.id, {
        adjusted: node.adjusted_confidence ?? node.original_confidence ?? 0,
        original: node.original_confidence ?? 0,
        id: node.id,
      });
    }
  }

  find(x: number): number {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: number, y: number): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;

    // Pick winner: highest adjusted_confidence, then original_confidence, then lowest ID
    const dataX = this.nodeData.get(rootX)!;
    const dataY = this.nodeData.get(rootY)!;

    let winner: number;
    if (Math.abs(dataX.adjusted - dataY.adjusted) > 0.001) {
      winner = dataX.adjusted > dataY.adjusted ? rootX : rootY;
    } else if (Math.abs(dataX.original - dataY.original) > 0.001) {
      winner = dataX.original > dataY.original ? rootX : rootY;
    } else {
      winner = dataX.id < dataY.id ? rootX : rootY;
    }

    const loser = winner === rootX ? rootY : rootX;
    this.parent.set(loser, winner);
  }

  getUltimateWinners(): Map<number, number> {
    const result = new Map<number, number>();
    for (const nodeId of this.parent.keys()) {
      const ultimate = this.find(nodeId);
      if (ultimate !== nodeId) {
        result.set(nodeId, ultimate);
      }
    }
    return result;
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  if (!DRY_RUN && !CONFIRM) {
    logger.error('Safety check: Set DEDUPE_CONFIRM=YES to run deduplication');
    logger.error('Or set DRY_RUN=true to see what would be merged without making changes');
    process.exit(1);
  }

  const db = createDatabaseClient();
  
  logger.info('Fetching all nodes...');
  const { nodes } = await db.getAllGraphData();
  
  // Separate Paper nodes from entity nodes for different deduplication logic
  const paperNodes = nodes.filter(n => n.type === 'Paper');
  const entityNodes = nodes.filter(n => n.type !== 'Paper');
  logger.info(`Found ${entityNodes.length} entity nodes and ${paperNodes.length} Paper nodes`);

  // Fetch paper metadata for Paper nodes to enable year/author checks
  const paperMetadataMap = new Map<number, { year: number | null; authors: string[] | null; title: string | null }>();
  if (paperNodes.length > 0) {
    const paperIds = paperNodes.map(n => n.canonical_name);
    const { data: papersData } = await db.client
      .from('papers')
      .select('paper_id, year, metadata')
      .in('paper_id', paperIds);

    for (const paper of papersData || []) {
      const node = paperNodes.find(n => n.canonical_name === paper.paper_id);
      if (node) {
        const metadata = paper.metadata as Record<string, unknown> | null;
        const authors = metadata?.authors as string[] | null | undefined;
        paperMetadataMap.set(node.id, {
          year: paper.year,
          authors: authors || null,
          title: node.metadata?.title as string | null || null,
        });
      }
    }
  }

  // For exact duplicate detection, use original canonical_name (already normalized)
  // For similarity comparison, we'll canonicalize on-the-fly
  const nodesWithCanonical = entityNodes.map(node => ({
    ...node,
    canonical_name_original: node.canonical_name,
    canonical_name_for_similarity: canonicalize(node.canonical_name), // Only for similarity checks
  }));

  // Group nodes by (canonical_name, type) - exact duplicates (using original canonical_name)
  const nodeGroups = new Map<string, Array<typeof nodesWithCanonical[0]>>();
  for (const node of nodesWithCanonical) {
    const key = `${node.canonical_name}::${node.type}`;
    if (!nodeGroups.has(key)) {
      nodeGroups.set(key, []);
    }
    nodeGroups.get(key)!.push(node);
  }

  // Find duplicate groups
  const duplicateGroups: Array<{ key: string; nodes: typeof nodesWithCanonical; winnerId: number }> = [];
  const exactDuplicateNodeIds = new Set<number>();
  
  for (const [key, groupNodes] of nodeGroups) {
    if (groupNodes.length > 1) {
      // Pick winner: highest adjusted_confidence, then highest original_confidence, then lowest ID
      groupNodes.sort((a, b) => {
        const aAdj = a.adjusted_confidence ?? a.original_confidence ?? 0;
        const bAdj = b.adjusted_confidence ?? b.original_confidence ?? 0;
        if (Math.abs(aAdj - bAdj) > 0.001) {
          return bAdj - aAdj;
        }
        const aOrig = a.original_confidence ?? 0;
        const bOrig = b.original_confidence ?? 0;
        if (Math.abs(aOrig - bOrig) > 0.001) {
          return bOrig - aOrig;
        }
        return a.id - b.id; // Lower ID wins tie
      });

      const winner = groupNodes[0]!;
      const losers = groupNodes.slice(1);
      
      duplicateGroups.push({
        key,
        nodes: groupNodes,
        winnerId: winner.id,
      });

      // Track all nodes in exact duplicate groups
      for (const node of groupNodes) {
        exactDuplicateNodeIds.add(node.id);
      }

      logger.info(`Duplicate group: ${key}`, {
        winner: winner.id,
        losers: losers.map(n => n.id),
        count: groupNodes.length,
      });
    }
  }

  logger.info(`Found ${duplicateGroups.length} exact duplicate groups`);

  // Also check for similar names (Levenshtein distance < 2) within same type
  // Use stricter criteria to avoid false positives
  const typeGroups = new Map<string, typeof nodesWithCanonical>();
  for (const node of nodesWithCanonical) {
    if (!typeGroups.has(node.type)) {
      typeGroups.set(node.type, []);
    }
    typeGroups.get(node.type)!.push(node);
  }

  const similarGroups: Array<{ nodes: typeof nodesWithCanonical; winnerId: number }> = [];
  const alreadyAssignedToGroup = new Set<number>(exactDuplicateNodeIds); // Start with exact duplicates

  for (const [type, typeNodes] of typeGroups) {
    // Sort by canonicalized name for deterministic processing and prefix-based early exit
    const sorted = [...typeNodes].sort((a, b) => 
      a.canonical_name_for_similarity.localeCompare(b.canonical_name_for_similarity)
    );
    
    for (let i = 0; i < sorted.length; i++) {
      const node1 = sorted[i]!;
      if (alreadyAssignedToGroup.has(node1.id)) continue;

      const similar: typeof nodesWithCanonical = [node1];
      const name1 = node1.canonical_name_for_similarity;
      
      // Only do fuzzy matching for names longer than 5 characters
      // Short names (like "SLAM" vs "sam") are too prone to false positives
      if (name1.length <= 5) {
        continue;
      }
      
      for (let j = i + 1; j < sorted.length; j++) {
        const node2 = sorted[j]!;
        if (alreadyAssignedToGroup.has(node2.id)) continue;
        
        const name2 = node2.canonical_name_for_similarity;
        
        // Skip if name2 is too short (prone to false positives)
        if (name2.length <= 5) {
          continue;
        }
        
        // Early exit: if prefixes diverge significantly, no point checking further
        const minLen = Math.min(name1.length, name2.length);
        if (minLen > 10) {
          // For longer names, check if first 10 chars differ significantly
          const prefix1 = name1.slice(0, 10);
          const prefix2 = name2.slice(0, 10);
          if (levenshtein(prefix1, prefix2) >= 2) {
            // Prefixes are too different, skip remaining (they're sorted, so all further will be worse)
            break;
          }
        }
        
        // Stricter threshold: only merge if distance is 1 (single character difference)
        // This catches typos and minor variations but avoids merging different entities
        const distance = levenshtein(name1, name2);
        if (distance === 1) {
          // Additional check: ensure the difference is not at the start (which often indicates different entities)
          // For example, "3DGS" vs "4DGS" should not merge
          let firstCharDiff = false;
          if (name1.length === name2.length) {
            let diffCount = 0;
            for (let k = 0; k < Math.min(3, name1.length); k++) {
              if (name1[k] !== name2[k]) {
                diffCount++;
                if (k === 0) firstCharDiff = true;
              }
            }
            // If difference is in first 3 chars, be more cautious
            if (firstCharDiff && diffCount === 1) {
              // Skip - likely different entities (e.g., "3DGS" vs "4DGS")
              continue;
            }
          }
          
          similar.push(node2);
        }
      }

      if (similar.length > 1) {
        // Pick winner same way
        similar.sort((a, b) => {
          const aAdj = a.adjusted_confidence ?? a.original_confidence ?? 0;
          const bAdj = b.adjusted_confidence ?? b.original_confidence ?? 0;
          if (Math.abs(aAdj - bAdj) > 0.001) {
            return bAdj - aAdj;
          }
          const aOrig = a.original_confidence ?? 0;
          const bOrig = b.original_confidence ?? 0;
          if (Math.abs(aOrig - bOrig) > 0.001) {
            return bOrig - aOrig;
          }
          return a.id - b.id;
        });

        const winner = similar[0]!;
        const losers = similar.slice(1);
        
        similarGroups.push({
          nodes: similar,
          winnerId: winner.id,
        });

        logger.info(`Similar group (type=${type}):`, {
          names: similar.map(n => `${n.canonical_name} (canonicalized: ${n.canonical_name_for_similarity}, id:${n.id})`),
          winner: winner.id,
          losers: losers.map(n => n.id),
        });

        // Mark all as assigned
        for (const n of similar) {
          alreadyAssignedToGroup.add(n.id);
        }
      }
    }
  }

  logger.info(`Found ${similarGroups.length} similar name groups`);

  // Handle Paper nodes separately with stricter matching (year + authors)
  const paperDuplicateGroups: Array<{ nodes: typeof paperNodes; winnerId: number }> = [];
  const paperGroups = new Map<string, typeof paperNodes>();
  
  for (const node of paperNodes) {
    const key = node.canonical_name; // Paper nodes use paper_id as canonical_name
    if (!paperGroups.has(key)) {
      paperGroups.set(key, []);
    }
    paperGroups.get(key)!.push(node);
  }

  // Find exact duplicate Paper nodes (same paper_id)
  for (const [key, groupNodes] of paperGroups) {
    if (groupNodes.length > 1) {
      // Pick winner: lowest ID (first created)
      groupNodes.sort((a, b) => a.id - b.id);
      const winner = groupNodes[0]!;
      
      paperDuplicateGroups.push({
        nodes: groupNodes,
        winnerId: winner.id,
      });

      logger.info(`Duplicate Paper nodes (same paper_id: ${key}):`, {
        winner: winner.id,
        losers: groupNodes.slice(1).map(n => n.id),
        count: groupNodes.length,
      });
    }
  }

  // SAFETY: Only dedupe Paper nodes by exact paper_id (canonical_name)
  // Do NOT do fuzzy title-based merging - too risky without stable identifiers (DOI, arXiv)
  logger.info(`Found ${paperDuplicateGroups.length} exact duplicate Paper groups`);
  logger.info(`Skipping fuzzy Paper title matching for safety (only merging exact paper_id duplicates)`);

  // Merge all groups using Union-Find to handle transitive merges
  const allGroups = [
    ...duplicateGroups.map(g => ({ nodes: g.nodes, winnerId: g.winnerId })),
    ...similarGroups,
    ...paperDuplicateGroups.map(g => ({ nodes: g.nodes, winnerId: g.winnerId })),
    // paperSimilarGroups removed - only exact paper_id matching for safety
  ];
  logger.info(`Total groups to merge: ${allGroups.length}`);

  // Build union-find structure (include all nodes: entities + papers)
  const allNodesForUnionFind = [...nodesWithCanonical, ...paperNodes];
  const uf = new UnionFind(allNodesForUnionFind);
  for (const group of allGroups) {
    const winner = group.nodes.find(n => n.id === group.winnerId);
    if (!winner) continue;

    for (const node of group.nodes) {
      if (node.id !== winner.id) {
        uf.union(node.id, winner.id);
      }
    }
  }

  // Get ultimate winners (handles transitive merges)
  const mergeMap = uf.getUltimateWinners();
  const ultimateWinners = new Set(mergeMap.values());
  const loserIds = Array.from(mergeMap.keys());

  logger.info(`Will merge ${mergeMap.size} nodes into ${ultimateWinners.size} ultimate winners`);

  // Print top 20 largest groups
  const groupSizes = new Map<number, number>();
  for (const [, winner] of mergeMap) {
    groupSizes.set(winner, (groupSizes.get(winner) || 0) + 1);
  }
  const topGroups = Array.from(groupSizes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  logger.info('Top 20 largest merge groups:');
  for (const [winnerId, count] of topGroups) {
    const winnerNode = allNodesForUnionFind.find(n => n.id === winnerId);
    logger.info(`  Winner ${winnerId} (${winnerNode?.canonical_name || 'unknown'}, ${winnerNode?.type || 'unknown'}): ${count} nodes will merge into this`);
  }

  // Write mergeMap to JSON file
  const mergeMapJson = {
    timestamp: new Date().toISOString(),
    totalMerges: mergeMap.size,
    ultimateWinners: ultimateWinners.size,
    mergeMap: Object.fromEntries(mergeMap),
    topGroups: topGroups.map(([winnerId, count]) => {
      const winnerNode = allNodesForUnionFind.find(n => n.id === winnerId);
      return {
        winnerId,
        winnerName: winnerNode?.canonical_name,
        winnerType: winnerNode?.type,
        mergeCount: count,
      };
    }),
  };

  const mergeMapPath = path.join(process.cwd(), 'dedupe_merge_map.json');
  fs.writeFileSync(mergeMapPath, JSON.stringify(mergeMapJson, null, 2));
  logger.info(`Merge map written to ${mergeMapPath}`);

  if (DRY_RUN) {
    logger.info('DRY RUN MODE: No changes made');
    logger.info(`Would merge ${mergeMap.size} nodes`);
    logger.info(`Would delete ${loserIds.length} loser nodes`);
    return;
  }

  // Verify no winner is in loserIds
  const winnersInLosers = loserIds.filter(id => ultimateWinners.has(id));
  if (winnersInLosers.length > 0) {
    logger.error('CRITICAL: Found winners in loser list!', { winnersInLosers });
    throw new Error('Safety check failed: winners cannot be deleted');
  }

  // Update edges to point to ultimate winner nodes
  logger.info('Updating edges to point to ultimate winner nodes...');
  let sourceEdgesUpdated = 0;
  let targetEdgesUpdated = 0;
  
  for (const [loserId, winnerId] of mergeMap) {
    // Update edges where loser is source
    const { data: sourceData, error: sourceError } = await db.client
      .from('edges')
      .update({ source_node_id: winnerId })
      .eq('source_node_id', loserId)
      .select('id');

    if (sourceError) {
      logger.error(`Failed to update edges with source ${loserId}`, { error: sourceError.message });
      throw sourceError;
    }
    sourceEdgesUpdated += sourceData?.length || 0;

    // Update edges where loser is target
    const { data: targetData, error: targetError } = await db.client
      .from('edges')
      .update({ target_node_id: winnerId })
      .eq('target_node_id', loserId)
      .select('id');

    if (targetError) {
      logger.error(`Failed to update edges with target ${loserId}`, { error: targetError.message });
      throw targetError;
    }
    targetEdgesUpdated += targetData?.length || 0;
  }

  logger.info(`Updated ${sourceEdgesUpdated} edges (source) and ${targetEdgesUpdated} edges (target)`);

  // Update entity_mentions to point to ultimate winner nodes
  logger.info('Updating entity_mentions to point to ultimate winner nodes...');
  let mentionsUpdated = 0;
  
  for (const [loserId, winnerId] of mergeMap) {
    const { data, error } = await db.client
      .from('entity_mentions')
      .update({ node_id: winnerId })
      .eq('node_id', loserId)
      .select('id');

    if (error) {
      logger.error(`Failed to update entity_mentions for node ${loserId}`, { error: error.message });
      throw error;
    }
    mentionsUpdated += data?.length || 0;
  }

  logger.info(`Updated ${mentionsUpdated} entity_mention references`);

  // Integrity check: verify no edges reference missing nodes
  // Use separate queries for safety (avoid complex .or() with .in())
  logger.info('Running integrity checks before deletion...');
  
  const { data: orphanEdgesSource, error: sourceError } = await db.client
    .from('edges')
    .select('id, source_node_id, target_node_id')
    .in('source_node_id', loserIds);

  if (sourceError) {
    logger.error('Failed to check for orphan edges (source)', { error: sourceError.message });
    throw sourceError;
  }

  const { data: orphanEdgesTarget, error: targetError } = await db.client
    .from('edges')
    .select('id, source_node_id, target_node_id')
    .in('target_node_id', loserIds);

  if (targetError) {
    logger.error('Failed to check for orphan edges (target)', { error: targetError.message });
    throw targetError;
  }

  const orphanEdges = [
    ...(orphanEdgesSource || []),
    ...(orphanEdgesTarget || []),
  ];

  if (orphanEdges.length > 0) {
    logger.error('CRITICAL: Found edges still referencing loser nodes!', { 
      count: orphanEdges.length,
      sample: orphanEdges.slice(0, 5),
    });
    throw new Error('Integrity check failed: edges still reference nodes to be deleted');
  }

  const { data: orphanMentions, error: mentionError } = await db.client
    .from('entity_mentions')
    .select('id, node_id')
    .in('node_id', loserIds);

  if (mentionError) {
    logger.error('Failed to check for orphan mentions', { error: mentionError.message });
    throw mentionError;
  }

  if (orphanMentions && orphanMentions.length > 0) {
    logger.error('CRITICAL: Found entity_mentions still referencing loser nodes!', {
      count: orphanMentions.length,
      sample: orphanMentions.slice(0, 5),
    });
    throw new Error('Integrity check failed: entity_mentions still reference nodes to be deleted');
  }

  logger.info('Integrity checks passed ✓');

  // After merging nodes, we may have duplicate edges - clean them up
  // Only select columns needed for deduplication to reduce memory usage
  logger.info('Checking for duplicate edges after node merge...');
  const { data: allEdges } = await db.client
    .from('edges')
    .select('id, source_node_id, target_node_id, relationship_type, confidence');

  // Group edges by (source, target, relationship_type)
  const duplicateEdges: number[] = [];
  if (!allEdges) {
    logger.warn('No edges found after merge');
  } else {
    type EdgeType = typeof allEdges[0];
    const edgeGroups = new Map<string, EdgeType[]>();
    for (const edge of allEdges) {
      const key = `${edge.source_node_id}::${edge.target_node_id}::${edge.relationship_type}`;
      if (!edgeGroups.has(key)) {
        edgeGroups.set(key, []);
      }
      edgeGroups.get(key)!.push(edge);
    }

    // Find duplicate edges
    for (const [key, edges] of edgeGroups) {
    if (edges.length > 1) {
      // Keep the edge with highest confidence, then lowest ID
      edges.sort((a, b) => {
        if (Math.abs(a.confidence - b.confidence) > 0.001) {
          return b.confidence - a.confidence;
        }
        return a.id - b.id;
      });

      const winner = edges[0]!;
      const losers = edges.slice(1);
      
      logger.info(`Duplicate edges: ${key}`, {
        winner: winner.id,
        losers: losers.map(e => e.id),
        count: edges.length,
      });

      duplicateEdges.push(...losers.map(e => e.id));
    }
    }
  }

  if (duplicateEdges.length > 0) {
    logger.info(`Deleting ${duplicateEdges.length} duplicate edges...`);
    const BATCH_SIZE = 100;
    for (let i = 0; i < duplicateEdges.length; i += BATCH_SIZE) {
      const batch = duplicateEdges.slice(i, i + BATCH_SIZE);
      const { error } = await db.client
        .from('edges')
        .delete()
        .in('id', batch);

      if (error) {
        logger.error(`Failed to delete edges batch`, { error: error.message });
        throw error;
      } else {
        logger.info(`Deleted edges batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(duplicateEdges.length / BATCH_SIZE)}`);
      }
    }
  }

  // Delete duplicate nodes
  // Note: We've already manually updated all edges and entity_mentions to point to winners.
  // FK constraints may CASCADE, but we don't rely on it - we've done the updates explicitly.
  logger.info('Deleting duplicate nodes...');
  const BATCH_SIZE = 100;
  let deletedCount = 0;

  for (let i = 0; i < loserIds.length; i += BATCH_SIZE) {
    const batch = loserIds.slice(i, i + BATCH_SIZE);
    const { error } = await db.client
      .from('nodes')
      .delete()
      .in('id', batch);

    if (error) {
      logger.error(`Failed to delete nodes batch`, { error: error.message, batch: batch.slice(0, 5) });
      throw error;
    } else {
      deletedCount += batch.length;
      logger.info(`Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(loserIds.length / BATCH_SIZE)}`);
    }
  }

  logger.info(`Deduplication complete!`);
  logger.info(`  Merged ${mergeMap.size} duplicate nodes into ${ultimateWinners.size} ultimate winners`);
  logger.info(`  Updated ${sourceEdgesUpdated + targetEdgesUpdated} edge references`);
  logger.info(`  Updated ${mentionsUpdated} entity_mention references`);
  logger.info(`  Deleted ${duplicateEdges.length} duplicate edges`);
  logger.info(`  Deleted ${deletedCount} duplicate nodes`);
}

main().catch((error) => {
  logger.error('Deduplication failed', { error: error.message, stack: error.stack });
  process.exit(1);
});

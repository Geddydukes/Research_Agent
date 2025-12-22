import 'dotenv/config';
import { createDatabaseClient } from '../src/db/client';
import { EntityEmbeddingService } from '../src/entities/embeddingService';
import { EntityResolver, selectCanonicalNode } from '../src/entities/resolver';
import { hasSharedPhrase, hasExactDefinitionMatch, hasSharedAlias } from '../src/entities/sharedPhrase';

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000000';
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = 10;

async function main() {
  const googleApiKey = process.env.GOOGLE_API_KEY;
  if (!googleApiKey) {
    throw new Error('Missing GOOGLE_API_KEY');
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  const db = createDatabaseClient(DEFAULT_TENANT_ID);
  const embeddingService = new EntityEmbeddingService(googleApiKey);
  const resolver = new EntityResolver(embeddingService);

  console.log('[Deduplication] Finding entities without embeddings...');
  
  // Get all entities without embeddings (excluding Paper nodes)
  const { data: nodes, error } = await db.client
    .from('nodes')
    .select('id, type, canonical_name, metadata, created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .neq('type', 'Paper')
    .or('embedding_index.is.null,embedding_raw.is.null');

  if (error) {
    throw new Error(`Failed to fetch nodes: ${error.message}`);
  }

  const totalNodes = nodes?.length || 0;
  console.log(`[Deduplication] Found ${totalNodes} entities without embeddings`);

  if (totalNodes === 0) {
    console.log('[Deduplication] No entities to process');
    return;
  }

  if (DRY_RUN) {
    console.log('[Deduplication] DRY RUN - would process:', nodes?.slice(0, 5).map(n => n.canonical_name));
    return;
  }

  let processed = 0;
  let embeddingsGenerated = 0;
  let linksCreated = 0;
  let linksAutoApproved = 0;
  let linksProposed = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < totalNodes; i += BATCH_SIZE) {
    const batch = nodes!.slice(i, i + BATCH_SIZE);
    console.log(`[Deduplication] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(totalNodes / BATCH_SIZE)} (${i + 1}-${Math.min(i + BATCH_SIZE, totalNodes)} of ${totalNodes})`);

    const batchPromises = batch.map(async (node) => {
      try {
        // Build entity context
        const definition = node.metadata?.definition as string | undefined;
        const evidence = node.metadata?.evidence as string | undefined;

        const entityContext = {
          name: node.canonical_name,
          type: node.type,
          definition,
          evidence,
        };

        // Generate embeddings
        const embeddingPair = await embeddingService.generateEmbedding(entityContext, DEFAULT_TENANT_ID);
        
        // Store embeddings
        await db.upsertNodeEmbeddings(node.id, embeddingPair.raw, embeddingPair.index);
        embeddingsGenerated++;

        // Find semantic candidates using embedding service directly
        const candidateResults = await embeddingService.findSimilarEntities(
          embeddingPair.index,
          node.type,
          db,
          0.90, // propose threshold
          50
        );

        if (candidateResults.length === 0) {
          return { processed: true, linksCreated: 0 };
        }

        // Get full node data for reranking
        const candidateIds = candidateResults.map(c => c.node_id);
        const { data: candidateNodes } = await db.client
          .from('nodes')
          .select('id, canonical_name, type, embedding_raw, metadata, created_at')
          .in('id', candidateIds)
          .eq('tenant_id', DEFAULT_TENANT_ID);

        if (!candidateNodes || candidateNodes.length === 0) {
          return { processed: true, linksCreated: 0 };
        }

        // Rerank using raw embeddings
        const nodesWithEmbeddings = candidateNodes.filter((n: any) => n.embedding_raw);
        const reranked = await embeddingService.rerankCandidates(
          embeddingPair.raw,
          nodesWithEmbeddings.map((n: any) => ({
            node_id: n.id,
            embedding_raw: n.embedding_raw,
          }))
        );

        // Get top candidate
        const topCandidate = reranked[0];
        if (!topCandidate) {
          return { processed: true, linksCreated: 0 };
        }

        const candidateNode = candidateNodes.find((n: any) => n.id === topCandidate.node_id);
        if (!candidateNode) {
          return { processed: true, linksCreated: 0 };
        }

        const candidates = [{
          node_id: topCandidate.node_id,
          similarity: topCandidate.similarity,
          node: candidateNode as any,
          sharedAlias: false,
          sharedPhrase: false,
        }];

        if (candidates.length === 0) {
          return { processed: true, linksCreated: 0 };
        }

        // Get mention counts for canonical selection
        const candidateNodeId = candidates[0]!.node_id;
        const { data: mentions } = await db.client
          .from('entity_mentions')
          .select('node_id')
          .in('node_id', [node.id, candidateNodeId])
          .eq('tenant_id', DEFAULT_TENANT_ID);

        const mentionCounts = new Map<number, number>();
        for (const mention of mentions || []) {
          mentionCounts.set(mention.node_id, (mentionCounts.get(mention.node_id) || 0) + 1);
        }

        // Get node creation dates
        const { data: nodeData } = await db.client
          .from('nodes')
          .select('id, created_at')
          .in('id', [node.id, candidateNodeId])
          .eq('tenant_id', DEFAULT_TENANT_ID);

        const nodeDates = new Map<number, string>();
        for (const n of nodeData || []) {
          nodeDates.set(n.id, n.created_at);
        }

        // Select canonical node using deterministic policy
        const candidatesForSelection = [
          {
            node_id: node.id,
            mention_count: mentionCounts.get(node.id) || 0,
            created_at: nodeDates.get(node.id) || node.created_at,
            canonical_name: node.canonical_name,
          },
          {
            node_id: candidateNodeId,
            mention_count: mentionCounts.get(candidateNodeId) || 0,
            created_at: nodeDates.get(candidateNodeId) || candidateNode.created_at,
            canonical_name: candidateNode.canonical_name,
          },
        ];

        const canonicalNodeId = selectCanonicalNode(candidatesForSelection);
        
        // Check if selected canonical is itself aliased (cycle prevention)
        const canonicalLinks = await db.getEntityLinks({
          nodeId: canonicalNodeId,
          status: 'approved',
          linkType: 'alias_of',
        });

        const trueCanonicalId = canonicalLinks.length > 0 
          ? canonicalLinks[0]!.canonical_node_id 
          : canonicalNodeId;

        // Check shared signals
        const sharedAlias = await hasSharedAlias(node.id, trueCanonicalId, db);
        const candidateDefinition = candidateNode.metadata?.definition as string | undefined;
        const sharedPhrase = hasSharedPhrase(definition, candidateDefinition) ||
                            hasExactDefinitionMatch(evidence, candidateNode.metadata?.evidence as string | undefined);

        const topCandidate = candidates[0]!;

        const autoApprove = resolver.shouldAutoApprove(
          topCandidate.similarity,
          node.type,
          node.canonical_name,
          sharedAlias,
          sharedPhrase
        );

        // Create entity link
        await db.insertEntityLink({
          node_id: node.id,
          canonical_node_id: trueCanonicalId,
          link_type: 'alias_of',
          confidence: topCandidate.similarity,
          status: autoApprove ? 'approved' : 'proposed',
          evidence: sharedPhrase ? 'Shared phrase detected' : sharedAlias ? 'Shared alias detected' : undefined,
        });

        linksCreated++;
        if (autoApprove) {
          linksAutoApproved++;
        } else {
          linksProposed++;
        }

        // Store alias
        try {
          await db.insertEntityAlias({
            node_id: trueCanonicalId,
            alias_name: node.canonical_name,
          });
        } catch (err) {
          // Ignore duplicate alias errors
        }

        return { processed: true, linksCreated: 1 };
      } catch (err) {
        console.error(`[Deduplication] Error processing ${node.canonical_name}:`, err);
        return { processed: false, linksCreated: 0 };
      }
    });

    const results = await Promise.all(batchPromises);
    
    for (const result of results) {
      processed++;
      if (!result.processed) {
        errors++;
      }
    }

    console.log(`[Deduplication] Progress: ${processed}/${totalNodes} (${embeddingsGenerated} embeddings, ${linksCreated} links, ${errors} errors)`);

    // Small delay between batches
    if (i + BATCH_SIZE < totalNodes) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n[Deduplication] Complete!');
  console.log(`  Total: ${totalNodes}`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Embeddings generated: ${embeddingsGenerated}`);
  console.log(`  Links created: ${linksCreated}`);
  console.log(`  Auto-approved: ${linksAutoApproved}`);
  console.log(`  Proposed: ${linksProposed}`);
  console.log(`  Errors: ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import 'dotenv/config';
import { createDatabaseClient } from '../src/db/client';
import { EmbeddingsClient } from '../src/embeddings/embed';
import { normalizeTextForEmbedding } from '../src/embeddings/similarity';

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000000';
const BATCH_SIZE = 10;
const DRY_RUN = process.env.DRY_RUN === 'true';

async function main() {
  const googleApiKey = process.env.GOOGLE_API_KEY;
  if (!googleApiKey) {
    throw new Error('Missing GOOGLE_API_KEY');
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  const db = createDatabaseClient(DEFAULT_TENANT_ID);
  const emb = new EmbeddingsClient(googleApiKey);

  console.log('[Backfill] Fetching papers without embeddings...');
  
  // Get all papers without embeddings
  const { data: papers, error } = await db.client
    .from('papers')
    .select('paper_id, title, abstract')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .is('embedding', null);

  if (error) {
    throw new Error(`Failed to fetch papers: ${error.message}`);
  }

  const totalPapers = papers?.length || 0;
  console.log(`[Backfill] Found ${totalPapers} papers without embeddings`);

  if (totalPapers === 0) {
    console.log('[Backfill] No papers to process');
    return;
  }

  if (DRY_RUN) {
    console.log('[Backfill] DRY RUN - would process:', papers?.slice(0, 5).map(p => p.paper_id));
    return;
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < totalPapers; i += BATCH_SIZE) {
    const batch = papers!.slice(i, i + BATCH_SIZE);
    console.log(`[Backfill] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(totalPapers / BATCH_SIZE)} (${i + 1}-${Math.min(i + BATCH_SIZE, totalPapers)} of ${totalPapers})`);

    const batchPromises = batch.map(async (paper) => {
      try {
        if (!paper.title && !paper.abstract) {
          console.warn(`[Backfill] Skipping ${paper.paper_id}: no title or abstract`);
          return { success: false, reason: 'no_content' };
        }

        const paperText = normalizeTextForEmbedding(paper.title || '', paper.abstract || '');
        const [embedding] = await emb.embedTexts([paperText], DEFAULT_TENANT_ID, 'gemini-embedding-001');

        if (!embedding) {
          console.warn(`[Backfill] Failed to generate embedding for ${paper.paper_id}`);
          return { success: false, reason: 'embedding_failed' };
        }

        await db.upsertPaperEmbedding(paper.paper_id, embedding);
        return { success: true };
      } catch (err) {
        console.error(`[Backfill] Error processing ${paper.paper_id}:`, err);
        return { success: false, reason: err instanceof Error ? err.message : String(err) };
      }
    });

    const results = await Promise.all(batchPromises);
    
    for (const result of results) {
      processed++;
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    console.log(`[Backfill] Progress: ${processed}/${totalPapers} (${succeeded} succeeded, ${failed} failed)`);

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < totalPapers) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n[Backfill] Complete!');
  console.log(`  Total: ${totalPapers}`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

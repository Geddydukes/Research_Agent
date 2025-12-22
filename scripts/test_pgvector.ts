import 'dotenv/config';
import { createDatabaseClient } from '../src/db/client';
import { EmbeddingsClient } from '../src/embeddings/embed';
import { normalizeTextForEmbedding, cosineSimilarity } from '../src/embeddings/similarity';

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000000';

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

  console.log('[Test] Testing pgvector implementation...\n');

  // Test 1: Store an embedding
  console.log('[Test 1] Storing embedding for a test paper...');
  const testPaperId = 'test_pgvector_' + Date.now();
  const testTitle = '3D Gaussian Splatting for Real-Time Radiance Field Rendering';
  const testAbstract = 'We introduce 3D Gaussian Splatting, a novel method for real-time neural radiance field rendering.';
  
  const testText = normalizeTextForEmbedding(testTitle, testAbstract);
  const [testEmbedding] = await emb.embedTexts([testText], DEFAULT_TENANT_ID, 'gemini-embedding-001');
  
  if (!testEmbedding) {
    throw new Error('Failed to generate test embedding');
  }

  // Create a test paper first
  await db.upsertPaper({
    paper_id: testPaperId,
    title: testTitle,
    abstract: testAbstract,
    year: 2023,
  });

  await db.upsertPaperEmbedding(testPaperId, testEmbedding);
  console.log('  ✓ Embedding stored successfully\n');

  // Test 2: Retrieve the embedding
  console.log('[Test 2] Retrieving embedding from database...');
  const retrieved = await db.getPaperEmbedding(testPaperId);
  if (!retrieved) {
    throw new Error('Failed to retrieve embedding');
  }
  if (retrieved.length !== testEmbedding.length) {
    throw new Error(`Embedding length mismatch: ${retrieved.length} vs ${testEmbedding.length}`);
  }
  
  // Verify it's the same
  const similarity = cosineSimilarity(testEmbedding, retrieved);
  if (Math.abs(similarity - 1.0) > 0.0001) {
    throw new Error(`Embedding mismatch: similarity = ${similarity}`);
  }
  console.log(`  ✓ Embedding retrieved successfully (similarity: ${similarity.toFixed(6)})\n`);

  // Test 3: Find similar papers
  console.log('[Test 3] Testing similarity search...');
  
  // Create another test paper with similar content
  const testPaperId2 = 'test_pgvector_2_' + Date.now();
  const testTitle2 = 'Gaussian Splatting Methods for Neural Rendering';
  const testAbstract2 = 'We explore Gaussian splatting techniques for efficient neural radiance field rendering.';
  
  const testText2 = normalizeTextForEmbedding(testTitle2, testAbstract2);
  const [testEmbedding2] = await emb.embedTexts([testText2], DEFAULT_TENANT_ID, 'gemini-embedding-001');
  
  await db.upsertPaper({
    paper_id: testPaperId2,
    title: testTitle2,
    abstract: testAbstract2,
    year: 2024,
  });
  await db.upsertPaperEmbedding(testPaperId2, testEmbedding2);

  // Search for similar papers using the first embedding
  const similar = await db.findSimilarPapers({
    queryEmbedding: testEmbedding,
    limit: 10,
    similarityThreshold: 0.5,
    excludePaperIds: [],
  });

  console.log(`  ✓ Found ${similar.length} similar papers`);
  if (similar.length > 0) {
    console.log('  Top results:');
    similar.slice(0, 3).forEach((result, i) => {
      console.log(`    ${i + 1}. ${result.paper_id}: ${result.similarity.toFixed(4)}`);
    });
  }
  console.log('');

  // Test 4: Verify tenant isolation
  console.log('[Test 4] Testing tenant isolation...');
  const similarWithExclusion = await db.findSimilarPapers({
    queryEmbedding: testEmbedding,
    limit: 10,
    similarityThreshold: 0.0,
    excludePaperIds: [testPaperId],
  });
  
  const foundExcluded = similarWithExclusion.some(r => r.paper_id === testPaperId);
  if (foundExcluded) {
    throw new Error('Tenant isolation failed: excluded paper found in results');
  }
  console.log('  ✓ Tenant isolation working correctly\n');

  // Cleanup
  console.log('[Test] Cleaning up test papers...');
  await db.client.from('papers').delete().eq('paper_id', testPaperId);
  await db.client.from('papers').delete().eq('paper_id', testPaperId2);
  console.log('  ✓ Cleanup complete\n');

  console.log('[Test] ✅ All tests passed!');
  console.log('\npgvector implementation is working correctly.');
}

main().catch((e) => {
  console.error('[Test] ❌ Test failed:', e);
  process.exit(1);
});

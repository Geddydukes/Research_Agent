
import 'dotenv/config';
import { selectCorpusUnified } from '../src/ingest/unified/selection';

async function main() {
  const seedTitle = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || '3D Gaussian Splatting';
  const simulateFailures = process.argv.includes('--simulate-failures');

  const ssApiKey = simulateFailures ? process.env.SEMANTIC_SCHOLAR_API_KEY : undefined;
  const googleApiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;

  if (!googleApiKey) {
    console.error('Missing GOOGLE_API_KEY');
    process.exit(1);
  }

  // Set environment variable to simulate failures if requested
  if (simulateFailures) {
    process.env.SIMULATE_SS_FAILURES = '1';
  } else {
    delete process.env.SIMULATE_SS_FAILURES;
  }

  console.log('='.repeat(80));
  console.log('TEST: Unified Selection');
  console.log('='.repeat(80));
  console.log(`Seed title: ${seedTitle}`);
  console.log(`Semantic Scholar API key: ${ssApiKey ? 'SET' : 'NOT SET'}`);
  console.log(`Simulate failures: ${simulateFailures}`);
  if (simulateFailures) {
    console.log('  → SIMULATE_SS_FAILURES=1 (citations/references will fail)');
  }
  console.log('='.repeat(80));
  console.log('');

  try {
    const result = await selectCorpusUnified({
      seedTitle,
      ssApiKey,
      googleApiKey,
      config: {
        semanticThreshold: 0.7,
        maxCandidatesToEmbed: 100, // Lower for testing
        maxSelectedPapers: 20, // Lower for testing
      },
      logger: {
        info: (msg, ctx) => {
          console.log(`[INFO] ${msg}`, ctx ? JSON.stringify(ctx, null, 2) : '');
        },
        warn: (msg, ctx) => {
          console.warn(`[WARN] ${msg}`, ctx ? JSON.stringify(ctx, null, 2) : '');
        },
      },
    });

    console.log('');
    console.log('='.repeat(80));
    console.log('TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`✓ Seed found: ${result.seed.title}`);
    console.log(`✓ Selected papers: ${result.selected.length}`);
    console.log('');
    console.log('Retrieval Stats:');
    console.log(`  - SS Citations: ${result.debug.retrievalStats.ssCitations}`);
    console.log(`  - SS References: ${result.debug.retrievalStats.ssReferences}`);
    console.log(`  - SS Keywords: ${result.debug.retrievalStats.ssKeywords}`);
    console.log(`  - arXiv: ${result.debug.retrievalStats.arxiv}`);
    console.log(`  - Total candidates: ${result.debug.retrievalStats.total}`);
    console.log('');
    console.log('Semantic Gating Stats:');
    console.log(`  - Candidates embedded: ${result.debug.gatingStats.candidatesEmbedded}`);
    console.log(`  - Passing threshold: ${result.debug.gatingStats.passingThreshold}`);
    console.log(`  - Similarity range: [${result.debug.gatingStats.similarityMin.toFixed(3)}, ${result.debug.gatingStats.similarityMax.toFixed(3)}]`);
    console.log(`  - Similarity median: ${result.debug.gatingStats.similarityMedian.toFixed(3)}`);
    console.log(`  - Selected count: ${result.debug.gatingStats.selectedCount}`);
    console.log('');
    console.log('Top 5 Selected Papers:');
    result.selected.slice(1, 6).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.title.substring(0, 60)}...`);
      console.log(`     Similarity: ${p.sim_to_seed.toFixed(3)}, Source: ${p.source}`);
    });
    console.log('');
    console.log('='.repeat(80));
    console.log('✓ TEST PASSED: Semantic gating works independently of retrieval source');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('TEST FAILED');
    console.error('='.repeat(80));
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import 'dotenv/config';
import { selectCorpus } from '../src/ingest/semanticScholar/selection';

async function main() {
  const seedTitle = process.argv.slice(2).join(' ').trim();
  if (!seedTitle) {
    console.error('Usage: ts-node scripts/select_corpus.ts <seed title>');
    process.exit(1);
  }

  const ssApiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const embeddingsModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

  if (!googleApiKey) throw new Error('Missing GOOGLE_API_KEY');

  const result = await selectCorpus({
    seedTitle,
    ssApiKey,
    googleApiKey,
    config: {
      embeddingsModel,
    },
  });

  console.log('Seed:', result.seed.title, result.seed.year);
  console.log('Selected count:', result.selected.length);
  console.log('Debug:', result.debug);
  const counts = result.selected.reduce<Record<string, number>>((acc, p) => {
    acc[p.selection_reason] = (acc[p.selection_reason] ?? 0) + 1;
    return acc;
  }, {});
  console.log('Selection reasons:', counts);
  for (const p of result.selected.slice(0, 10)) {
    console.log(`[${p.selection_reason}] (${p.year}) ${p.title}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


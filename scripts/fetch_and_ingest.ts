import 'dotenv/config';
import path from 'path';
import { selectCorpus } from '../src/ingest/semanticScholar/selection';
import { selectCorpusArxiv } from '../src/ingest/arxiv/selection';
import { downloadPdfsForSelected } from '../src/ingest/semanticScholar/downloader';
import { parsePaperFile } from '../src/utils/paperParser';
import { runPipeline } from '../src/pipeline/runPipeline';
import { createDatabaseClient } from '../src/db/client';

async function main() {
  const seedTitle = process.argv.slice(2).join(' ').trim();
  if (!seedTitle) {
    console.error('Usage: ts-node scripts/fetch_and_ingest.ts <seed title>');
    process.exit(1);
  }

  const ssApiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  const embeddingsModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
  const limit = Number(process.env.INGEST_LIMIT || '10');
  const downloadDir = process.env.INGEST_DOWNLOAD_DIR || path.join(process.cwd(), 'downloads');

  console.log('[env] cwd:', process.cwd());
  console.log('[env] GOOGLE_API_KEY present:', Boolean(googleApiKey));

  if (!googleApiKey) throw new Error('Missing GOOGLE_API_KEY');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  const useArxivOnly = process.env.USE_ARXIV === '1';

  let selection:
    | {
        seed: { paperId: string; title: string; year?: number; externalIds?: Record<string, string> };
        selected: Array<{ paperId: string; title: string; abstract?: string; year?: number; externalIds?: Record<string, string> }>;
        debug: Record<string, unknown>;
      }
    | null = null;

  if (!useArxivOnly) {
    try {
      console.log('[Select] Starting selection from Semantic Scholar...');
      selection = await selectCorpus({
        seedTitle,
        ssApiKey,
        googleApiKey,
        config: { embeddingsModel },
      });
    } catch (err) {
      console.warn('[Select] Semantic Scholar failed, falling back to arXiv-only selection', err);
    }
  }

  if (!selection) {
    console.log('[Select] Using arXiv-only selection...');
    selection = await selectCorpusArxiv({
      seedQuery: seedTitle,
      googleApiKey,
      config: {
        embeddingsModel,
      },
    });
  }

  const withArxiv: typeof selection.selected = [];
  for (const p of selection.selected) {
    if (p.externalIds?.arxiv) {
      withArxiv.push(p);
    }
    if (withArxiv.length >= limit) break;
  }

  if (withArxiv.length === 0) {
    throw new Error('No selected papers with arxiv IDs to download.');
  }

  console.log(
    `[Select] Seed: ${selection.seed.title} (${selection.seed.year}) | Selected with arxiv: ${withArxiv.length} (target ${limit})`
  );

  const downloads = await downloadPdfsForSelected(withArxiv, downloadDir, withArxiv.length);

  const succeeded = downloads.filter((d) => d.ok) as Array<{
    paperId: string;
    ok: true;
    filePath: string;
  }>;
  const failed = downloads.filter((d) => !d.ok) as Array<{ paperId: string; ok: false; reason: string }>;

  console.log(`[Download] Success: ${succeeded.length} | Failed: ${failed.length}`);
  for (const f of failed) {
    console.warn(`[Download] Failed ${f.paperId}: ${f.reason}`);
  }

  const db = createDatabaseClient();
  const ingestTasks = succeeded.map(async (d) => {
    try {
      console.log(`[Ingest] Parsing ${d.filePath}`);
      const paperInput = await parsePaperFile(d.filePath);
      console.log(`[Ingest] Running pipeline for ${paperInput.paper_id}`);
      const result = await runPipeline(paperInput, db);
      console.log(`[Ingest] Done ${paperInput.paper_id} success=${result.success}`);
      return result.success;
    } catch (err) {
      console.error(`[Ingest] Failed for ${d.paperId}:`, err);
      return false;
    }
  });

  const ingestResults = await Promise.allSettled(ingestTasks);
  const okCount = ingestResults.filter((r) => r.status === 'fulfilled' && r.value === true).length;

  console.log(`[Done] Ingested ${okCount} papers. Seed: ${selection.seed.title}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


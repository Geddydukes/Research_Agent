import 'dotenv/config';
import path from 'path';
import { selectCorpus } from '../src/ingest/semanticScholar/selection';
import { selectCorpusArxiv } from '../src/ingest/arxiv/selection';
import { extractArxivId, searchArxivByTitle } from '../src/ingest/arxiv/util';
import { downloadPdfsForSelected } from '../src/ingest/semanticScholar/downloader';
import { parsePaperFile } from '../src/utils/paperParser';
import { runPipeline } from '../src/pipeline/runPipeline';
import { runReasoningBatch } from '../src/pipeline/runReasoningBatch';
import { createDatabaseClient } from '../src/db/client';
import path from 'path';

const defaultLogger = {
  error: (msg: string, ctx?: Record<string, unknown>) => console.error(`[Ingest] ${msg}`, ctx || ''),
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(`[Ingest] ${msg}`, ctx || ''),
  info: (msg: string, ctx?: Record<string, unknown>) => console.info(`[Ingest] ${msg}`, ctx || ''),
};

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
  const forceReingest = process.env.FORCE_REINGEST === '1';
  const mode = process.env.MODE || 'incremental';

  const db = createDatabaseClient();

  let selection:
    | {
        seed: { paperId: string; title: string; year?: number; externalIds?: Record<string, string>; arxivId?: string | null };
        selected: Array<{ paperId: string; title: string; abstract?: string; year?: number; externalIds?: Record<string, string>; arxivId?: string | null }>;
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

  // Resolve arXiv IDs aggressively (normalize + title search), and allow metadata-only fallback
  const resolved: typeof selection.selected = [];
  for (const p of selection.selected) {
    if (resolved.length >= limit) break;
    const direct = p.arxivId || extractArxivId(p);
    if (direct) {
      resolved.push({ ...p, arxivId: direct });
      continue;
    }
    const fromTitle = p.title ? await searchArxivByTitle(p.title) : null;
    if (fromTitle) {
      resolved.push({ ...p, arxivId: fromTitle });
      continue;
    }
    // metadata-only fallback
    resolved.push({ ...p, arxivId: null });
  }

  const downloadable = resolved.filter((p) => p.arxivId);

  let toDownload = downloadable;
  if (mode === 'incremental' && !forceReingest) {
    const paperIds = downloadable.map((p) => p.paperId || p.arxivId || '').filter(Boolean);
    const existing = await db.getExistingPaperIds(paperIds);
    toDownload = downloadable.filter((p) => {
      const id = p.paperId || p.arxivId || '';
      return !existing.has(id);
    });
    console.log(
      `[Select] Filtered: ${toDownload.length}/${downloadable.length} papers need download (${existing.size} already exist)`
    );
  }

  console.log(
    `[Select] Seed: ${selection.seed.title} (${selection.seed.year}) | Selected: ${resolved.length} | With arxiv: ${downloadable.length} | To download: ${toDownload.length} (target ${limit})`
  );

  const downloads =
    toDownload.length > 0
      ? await downloadPdfsForSelected(toDownload as any, downloadDir, Math.min(toDownload.length, limit))
      : [];

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

  // Prepare ingestion tasks: downloaded PDFs first, then metadata-only if no PDF
  const ingestTasks = resolved.slice(0, limit).map(async (p) => {
    const downloaded = succeeded.find((d) => d.paperId === p.paperId || d.paperId === p.arxivId);
    if (!downloaded) {
      console.warn(`[Ingest] No PDF for ${p.paperId}; skipping PDF parse and storing metadata only.`);
      try {
        await db.upsertPaper({
          paper_id: p.paperId,
          title: p.title,
          abstract: p.abstract,
          year: p.year,
          metadata: { externalIds: p.externalIds || {} },
        });
      } catch (err) {
        console.warn(`[Ingest] Metadata-only upsert failed for ${p.paperId}`, err);
      }
      return false;
    }

    try {
      console.log(`[Ingest] Parsing ${downloaded.filePath}`);
      const paperInput = await parsePaperFile(downloaded.filePath);
      console.log(`[Ingest] Running pipeline for ${paperInput.paper_id}`);
      const result = await runPipeline(paperInput, db, defaultLogger, {
        forceReingest,
      });
      console.log(`[Ingest] Done ${paperInput.paper_id} success=${result.success}`);
      return result.success;
    } catch (err) {
      console.error(`[Ingest] Failed for ${downloaded.paperId}:`, err);
      return false;
    }
  });

  const ingestResults = await Promise.allSettled(ingestTasks);
  const okResults = ingestResults
    .map((r, idx) => ({ result: r, paper: resolved[idx] }))
    .filter((r) => r.result.status === 'fulfilled' && r.result.value === true);
  const okCount = okResults.length;
  const affectedPaperIds = okResults
    .map((r) => {
      const downloaded = succeeded.find(
        (d) => d.paperId === r.paper.paperId || d.paperId === r.paper.arxivId
      );
      if (downloaded) {
        const fileName = path.basename(downloaded.filePath, '.pdf');
        return fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
      }
      return r.paper.paperId;
    })
    .filter(Boolean);

  console.log(`[Done] Ingested ${okCount} papers. Seed: ${selection.seed.title}`);

  if (okCount > 0) {
    try {
      await runReasoningBatch(db, defaultLogger, undefined, affectedPaperIds);
      console.log('[ReasoningBatch] Completed');
    } catch (err) {
      console.error('[ReasoningBatch] Failed', err);
    }
  } else {
    console.log('[ReasoningBatch] Skipped (no successful ingests)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


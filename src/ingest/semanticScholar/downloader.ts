import * as fs from 'fs/promises';
import * as path from 'path';
import type { SSPaper } from './client';
import { extractArxivId } from '../arxiv/util';
import { limit } from '../../utils/limiter';

type DownloadResult =
  | { paperId: string; ok: true; filePath: string }
  | { paperId: string; ok: false; reason: string };

function arxivPdfUrl(arxivId: string): string {
  return `https://arxiv.org/pdf/${encodeURIComponent(arxivId)}.pdf`;
}

async function writeBuffer(filePath: string, data: Buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

export async function downloadPdfForPaper(
  paper: SSPaper,
  destDir: string
): Promise<DownloadResult> {
  const arxivId =
    (paper as any).arxivId ||
    extractArxivId(paper) ||
    paper.externalIds?.arxiv ||
    paper.externalIds?.arXiv ||
    paper.externalIds?.ArXiv;
  if (!arxivId) {
    return { paperId: paper.paperId, ok: false, reason: 'no_arxiv_id' };
  }

  return limit('arxiv_download', async () => {
    const url = arxivPdfUrl(arxivId);
    const res = await fetch(url);
    if (!res.ok) {
      return {
        paperId: paper.paperId,
        ok: false,
        reason: `fetch_failed_${res.status}`,
      };
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('pdf')) {
      return { paperId: paper.paperId, ok: false, reason: 'not_pdf_response' };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const safeName = paper.paperId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(destDir, `${safeName}.pdf`);
    await writeBuffer(filePath, buf);

    return { paperId: paper.paperId, ok: true, filePath };
  });
}

export async function downloadPdfsForSelected(
  papers: SSPaper[],
  destDir: string,
  limit = papers.length
): Promise<DownloadResult[]> {
  const subset = papers.slice(0, limit);
  const downloadPromises = subset.map(async (p) => {
    try {
      return await downloadPdfForPaper(p, destDir);
    } catch (error) {
      return {
        paperId: p.paperId,
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      } as DownloadResult;
    }
  });
  return Promise.all(downloadPromises);
}



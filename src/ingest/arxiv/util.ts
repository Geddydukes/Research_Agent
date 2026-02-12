import { limit } from '../../utils/limiter';

export function extractArxivId(p: { externalIds?: Record<string, string> }): string | null {
  const e = p.externalIds ?? {};
  const raw =
    e.ArXiv || e.arXiv || e.arxiv || e.arXivId || e.arxivId || null;
  if (!raw) return null;
  const m = String(raw).match(/(\d{4}\.\d{4,5})(v\d+)?/);
  return m ? `${m[1]}${m[2] ?? ''}` : null;
}

export async function searchArxivByTitle(title: string): Promise<string | null> {
  return limit('arxiv_download', async () => {
    const url =
      'https://export.arxiv.org/api/query?' +
      new URLSearchParams({
        search_query: `ti:"${title}"`,
        start: '0',
        max_results: '3',
        sortBy: 'relevance',
      }).toString();

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      const m = text.match(/<id>https?:\/\/arxiv\.org\/abs\/(\d{4}\.\d{4,5}(v\d+)?)<\/id>/);
      if (m) return m[1];
    } catch {
      return null;
    }
    return null;
  });
}

import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';
import { limit } from '../../utils/limiter';

export type ArxivPaper = {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  externalIds?: Record<string, string>;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

export class ArxivClient {
  private baseUrl = 'https://export.arxiv.org/api/query';

  async search(query: string, maxResults = 40): Promise<ArxivPaper[]> {
    return limit('arxiv_download', async () => {
      const url =
        `${this.baseUrl}?` +
        new URLSearchParams({
          search_query: query,
          start: '0',
          max_results: String(maxResults),
          sortBy: 'relevance',
        }).toString();

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`ArXiv search failed: ${res.status} ${await res.text()}`);
      }

      const xml = await res.text();
      const json = parser.parse(xml);
      const entries = (json.feed?.entry || []) as any[];
      const papers: ArxivPaper[] = entries.map((e) => {
        const rawId: string = e.id || '';
        const idPart = rawId.split('/abs/')[1] || rawId.split('/')[rawId.split('/').length - 1] || rawId;
        const title: string = (e.title || '').replace(/\s+/g, ' ').trim();
        const summary: string = (e.summary || '').trim();
        const published: string = e.published || '';
        const year = published ? Number(published.slice(0, 4)) : undefined;
        return {
          paperId: idPart,
          title,
          abstract: summary,
          year: isFinite(year || NaN) ? year : undefined,
          citationCount: undefined,
          externalIds: { arxiv: idPart },
        };
      });

      return papers.filter((p) => p.title);
    });
  }
}



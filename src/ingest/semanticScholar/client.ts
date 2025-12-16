import fetch from 'node-fetch';

export type SSPaper = {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  externalIds?: Record<string, string>;
};

export class SemanticScholarClient {
  private baseUrl = 'https://api.semanticscholar.org/graph/v1';

  constructor(private apiKey?: string) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['x-api-key'] = this.apiKey;
    return h;
  }

  async searchPaperByTitle(title: string, limit = 5): Promise<SSPaper[]> {
    const url =
      `${this.baseUrl}/paper/search?` +
      new URLSearchParams({
        query: title,
        limit: String(limit),
        fields: 'paperId,title,abstract,year,citationCount,externalIds',
      }).toString();
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`SS search failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: SSPaper[] };
    return json.data ?? [];
  }

  async getPaper(paperId: string): Promise<SSPaper> {
    const url =
      `${this.baseUrl}/paper/${encodeURIComponent(paperId)}?` +
      new URLSearchParams({
        fields: 'paperId,title,abstract,year,citationCount,externalIds',
      }).toString();
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`SS getPaper failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as SSPaper;
  }

  async getCitations(paperId: string, limit = 200, offset = 0): Promise<SSPaper[]> {
    const url =
      `${this.baseUrl}/paper/${encodeURIComponent(paperId)}/citations?` +
      new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        fields:
          'citingPaper.paperId,citingPaper.title,citingPaper.abstract,citingPaper.year,citingPaper.citationCount,citingPaper.externalIds',
      }).toString();
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`SS citations failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: Array<{ citingPaper: SSPaper | null }> };
    return (json.data ?? []).map((d) => d.citingPaper).filter(Boolean) as SSPaper[];
  }

  async getReferences(paperId: string, limit = 200, offset = 0): Promise<SSPaper[]> {
    const url =
      `${this.baseUrl}/paper/${encodeURIComponent(paperId)}/references?` +
      new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        fields:
          'citedPaper.paperId,citedPaper.title,citedPaper.abstract,citedPaper.year,citedPaper.citationCount,citedPaper.externalIds',
      }).toString();
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`SS references failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: Array<{ citedPaper: SSPaper | null }> };
    return (json.data ?? []).map((d) => d.citedPaper).filter(Boolean) as SSPaper[];
  }

  async keywordSearch(query: string, limit = 100): Promise<SSPaper[]> {
    const url =
      `${this.baseUrl}/paper/search?` +
      new URLSearchParams({
        query,
        limit: String(limit),
        fields: 'paperId,title,abstract,year,citationCount,externalIds',
      }).toString();
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`SS keywordSearch failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: SSPaper[] };
    return json.data ?? [];
  }
}



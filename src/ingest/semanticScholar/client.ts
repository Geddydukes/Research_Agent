import { limit } from '../../utils/limiter';

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

  async searchPaperByTitle(title: string, limitParam = 5): Promise<SSPaper[]> {
    return limit('semantic_scholar', async () => {
      const url =
        `${this.baseUrl}/paper/search?` +
        new URLSearchParams({
          query: title,
          limit: String(limitParam),
          fields: 'paperId,title,abstract,year,citationCount,externalIds',
        }).toString();
      const timeoutMs = 30000;
      const controller = new AbortController();
      
      const fetchPromise = (async () => {
        try {
          const res = await fetch(url, { headers: this.headers(), signal: controller.signal });
          if (!res.ok) throw new Error(`SS search failed: ${res.status} ${await res.text()}`);
          const json = (await res.json()) as { data: SSPaper[] };
          return json.data ?? [];
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`SS search timed out after ${timeoutMs}ms`);
          }
          throw err;
        }
      })();
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          controller.abort();
          reject(new Error(`SS search timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      return Promise.race([fetchPromise, timeoutPromise]);
    });
  }

  async getPaper(paperId: string): Promise<SSPaper> {
    return limit('semantic_scholar', async () => {
      const url =
        `${this.baseUrl}/paper/${encodeURIComponent(paperId)}?` +
        new URLSearchParams({
          fields: 'paperId,title,abstract,year,citationCount,externalIds',
        }).toString();
      const timeoutMs = 30000;
      const controller = new AbortController();
      
      const fetchPromise = (async () => {
        try {
          const res = await fetch(url, { headers: this.headers(), signal: controller.signal });
          if (!res.ok) throw new Error(`SS getPaper failed: ${res.status} ${await res.text()}`);
          return (await res.json()) as SSPaper;
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`SS getPaper timed out after ${timeoutMs}ms`);
          }
          throw err;
        }
      })();
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          controller.abort();
          reject(new Error(`SS getPaper timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      return Promise.race([fetchPromise, timeoutPromise]);
    });
  }

  async getCitations(paperId: string, limitParam = 200, offset = 0): Promise<SSPaper[]> {
    return limit('semantic_scholar', async () => {
      const url =
        `${this.baseUrl}/paper/${encodeURIComponent(paperId)}/citations?` +
        new URLSearchParams({
          limit: String(limitParam),
          offset: String(offset),
          fields:
            'citingPaper.paperId,citingPaper.title,citingPaper.abstract,citingPaper.year,citingPaper.citationCount,citingPaper.externalIds',
        }).toString();
      const timeoutMs = 30000;
      const controller = new AbortController();
      
      const fetchPromise = (async () => {
        try {
          const res = await fetch(url, { headers: this.headers(), signal: controller.signal });
          if (!res.ok) throw new Error(`SS citations failed: ${res.status} ${await res.text()}`);
          const json = (await res.json()) as { data: Array<{ citingPaper: SSPaper | null }> };
          return (json.data ?? []).map((d) => d.citingPaper).filter(Boolean) as SSPaper[];
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`SS citations timed out after ${timeoutMs}ms`);
          }
          throw err;
        }
      })();
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          controller.abort();
          reject(new Error(`SS citations timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      return Promise.race([fetchPromise, timeoutPromise]);
    });
  }

  async getReferences(paperId: string, limitParam = 200, offset = 0): Promise<SSPaper[]> {
    return limit('semantic_scholar', async () => {
      const url =
        `${this.baseUrl}/paper/${encodeURIComponent(paperId)}/references?` +
        new URLSearchParams({
          limit: String(limitParam),
          offset: String(offset),
          fields:
            'citedPaper.paperId,citedPaper.title,citedPaper.abstract,citedPaper.year,citedPaper.citationCount,citedPaper.externalIds',
        }).toString();
      const timeoutMs = 30000;
      const controller = new AbortController();
      
      const fetchPromise = (async () => {
        try {
          const res = await fetch(url, { headers: this.headers(), signal: controller.signal });
          if (!res.ok) throw new Error(`SS references failed: ${res.status} ${await res.text()}`);
          const json = (await res.json()) as { data: Array<{ citedPaper: SSPaper | null }> };
          return (json.data ?? []).map((d) => d.citedPaper).filter(Boolean) as SSPaper[];
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`SS references timed out after ${timeoutMs}ms`);
          }
          throw err;
        }
      })();
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          controller.abort();
          reject(new Error(`SS references timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      return Promise.race([fetchPromise, timeoutPromise]);
    });
  }

  async keywordSearch(query: string, limitParam = 100): Promise<SSPaper[]> {
    return limit('semantic_scholar', async () => {
      const url =
        `${this.baseUrl}/paper/search?` +
        new URLSearchParams({
          query,
          limit: String(limitParam),
          fields: 'paperId,title,abstract,year,citationCount,externalIds',
        }).toString();
      const timeoutMs = 30000;
      const controller = new AbortController();
      
      const fetchPromise = (async () => {
        try {
          const res = await fetch(url, { headers: this.headers(), signal: controller.signal });
          if (!res.ok) throw new Error(`SS keywordSearch failed: ${res.status} ${await res.text()}`);
          const json = (await res.json()) as { data: SSPaper[] };
          return json.data ?? [];
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`SS keywordSearch timed out after ${timeoutMs}ms`);
          }
          throw err;
        }
      })();
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          controller.abort();
          reject(new Error(`SS keywordSearch timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      return Promise.race([fetchPromise, timeoutPromise]);
    });
  }
}



import { GoogleGenerativeAI } from '@google/generative-ai';

export type EmbeddingVector = number[];

export class EmbeddingsClient {
  private ai: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenerativeAI(apiKey);
  }

  async embedTexts(texts: string[], model = 'gemini-embedding-001'): Promise<EmbeddingVector[]> {
    if (texts.length === 0) return [];

    const m = this.ai.getGenerativeModel({ model });
    const results: EmbeddingVector[] = [];
    for (const text of texts) {
      const resp = await m.embedContent({ content: { role: 'user', parts: [{ text }] } });
      const vals = (resp.embedding?.values ?? []) as number[];
      results.push(vals);
    }
    return results;
  }
}


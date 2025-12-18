import type { DatabaseClient, Paper } from '../../db/client';

export type PaperWithName = Paper & { name: string };

export class NodesService {
  constructor(private db: DatabaseClient) {}

  async getPapersForNode(nodeId: number): Promise<PaperWithName[]> {
    return this.db.getPapersForNode(nodeId);
  }
}

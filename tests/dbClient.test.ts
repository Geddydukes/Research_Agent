import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DatabaseClient } from '../src/db/client';

describe('DatabaseClient edge query fixes', () => {
  let mockSupabaseClient: any;
  let dbClient: DatabaseClient;

  beforeEach(() => {
    mockSupabaseClient = {
      from: jest.fn(() => mockSupabaseClient),
      select: jest.fn(() => mockSupabaseClient),
      eq: jest.fn(() => mockSupabaseClient),
      in: jest.fn(() => mockSupabaseClient),
      or: jest.fn(() => mockSupabaseClient),
    };

    // @ts-ignore - bypassing constructor for testing
    dbClient = new DatabaseClient('http://test', 'test-key');
    dbClient.client = mockSupabaseClient;
  });

  describe('getEdgesForPaper', () => {
    it('uses OR logic to match edges where either source OR target is in node set', async () => {
      (dbClient as any).getNodesForPaper = jest.fn<() => Promise<any[]>>().mockResolvedValue([
        { id: 1, type: 'Entity', canonical_name: 'node1', metadata: null, original_confidence: null, adjusted_confidence: null, created_at: '2024-01-01' },
        { id: 2, type: 'Entity', canonical_name: 'node2', metadata: null, original_confidence: null, adjusted_confidence: null, created_at: '2024-01-01' },
        { id: 3, type: 'Entity', canonical_name: 'node3', metadata: null, original_confidence: null, adjusted_confidence: null, created_at: '2024-01-01' },
      ]);

      const mockEdges = [
        { id: 10, source_node_id: 1, target_node_id: 4, relationship_type: 'relates_to' },
        { id: 11, source_node_id: 5, target_node_id: 2, relationship_type: 'relates_to' },
        { id: 12, source_node_id: 1, target_node_id: 2, relationship_type: 'relates_to' },
      ];

      mockSupabaseClient.or.mockResolvedValue({
        data: mockEdges,
        error: null,
      });

      const result = await dbClient.getEdgesForPaper('paper1');

      expect(mockSupabaseClient.or).toHaveBeenCalledWith(
        'source_node_id.in.(1,2,3),target_node_id.in.(1,2,3)'
      );

      expect(result).toHaveLength(3);
      expect(result[0]?.id).toBe(10);
      expect(result[1]?.id).toBe(11);
      expect(result[2]?.id).toBe(12);
    });

    it('handles empty node sets', async () => {
      (dbClient as any).getNodesForPaper = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

      const result = await dbClient.getEdgesForPaper('paper1');

      expect(result).toEqual([]);
      expect(mockSupabaseClient.or).not.toHaveBeenCalled();
    });
  });

  describe('findNodesByCanonicalNames', () => {
    it('batches lookups for multiple (canonical_name, type) pairs', async () => {
      const pairs = [
        { canonical_name: 'node1', type: 'Entity' },
        { canonical_name: 'node2', type: 'Entity' },
        { canonical_name: 'node1', type: 'Method' },
      ];

      const mockNodes = [
        { id: 1, canonical_name: 'node1', type: 'Entity', metadata: null },
        { id: 3, canonical_name: 'node1', type: 'Method', metadata: null },
      ];

      mockSupabaseClient.or.mockResolvedValue({
        data: mockNodes,
        error: null,
      });

      const result = await dbClient.findNodesByCanonicalNames(pairs);

      expect(mockSupabaseClient.or).toHaveBeenCalledTimes(1);
      const orCall = mockSupabaseClient.or.mock.calls[0]![0] as string;
      expect(orCall).toContain('canonical_name.eq.node1.and.type.eq.Entity');
      expect(orCall).toContain('canonical_name.eq.node2.and.type.eq.Entity');
      expect(orCall).toContain('canonical_name.eq.node1.and.type.eq.Method');

      expect(result.size).toBe(2);
      expect(result.get('node1|Entity')?.id).toBe(1);
      expect(result.get('node1|Method')?.id).toBe(3);
      expect(result.get('node2|Entity')).toBeUndefined();
    });

    it('returns empty map for empty input', async () => {
      const result = await dbClient.findNodesByCanonicalNames([]);
      expect(result.size).toBe(0);
      expect(mockSupabaseClient.or).not.toHaveBeenCalled();
    });
  });
});

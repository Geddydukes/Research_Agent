import { describe, it, expect, jest } from '@jest/globals';
import { buildSubgraph } from '../src/reasoning/buildSubgraph';
import { DatabaseClient } from '../src/db/client';

describe('buildSubgraph', () => {
  it('returns correct induced subgraph for affected papers', async () => {
    const mockNodes = [
      { id: 1, canonical_name: 'paper1', type: 'Paper', metadata: null },
      { id: 2, canonical_name: 'entity1', type: 'Method', metadata: null },
    ];
    
    const mockEdges = [
      { id: 1, source_node_id: 1, target_node_id: 2, relationship_type: 'introduces', confidence: 0.9, evidence: null, provenance: null },
    ];
    
    const mockDb = {
      getNodesForPaper: jest.fn<() => Promise<any[]>>().mockResolvedValue(mockNodes),
      getEdgesForPaper: jest.fn<() => Promise<any[]>>().mockResolvedValue(mockEdges),
      client: {
        from: jest.fn(() => ({
          select: jest.fn((fields?: string, opts?: any) => {
            if (opts && opts.count === 'exact' && opts.head) {
              return Promise.resolve({ count: 0 });
            }
            const mockResult = {
              in: jest.fn(() => mockResult),
              eq: jest.fn(() => mockResult),
              or: jest.fn(() => mockResult),
              then: jest.fn((fn: (r: any) => any) => {
                if (fields === 'paper_id, title, year') {
                  return Promise.resolve(fn({ data: [{ paper_id: 'paper1', title: 'Test', year: 2024 }] }));
                }
                if (fields === 'source_node_id, target_node_id, id') {
                  return Promise.resolve(fn({ data: mockEdges.map(e => ({ source_node_id: e.source_node_id, target_node_id: e.target_node_id, id: e.id })) }));
                }
                if (fields === '*') {
                  if (mockResult.in.mock.calls.length > 0 || mockResult.or.mock.calls.length > 0) {
                    const inCalls = mockResult.in.mock.calls;
                    const orCalls = mockResult.or.mock.calls;
                    const lastInCall = inCalls.length > 0 ? inCalls[inCalls.length - 1] : null;
                    const lastOrCall = orCalls.length > 0 ? orCalls[orCalls.length - 1] : null;
                    const lastCall = lastInCall || lastOrCall;
                    if (lastCall && Array.isArray(lastCall) && lastCall.length > 0) {
                      const firstArg = (lastCall as any[])[0];
                      if (firstArg === 'id') {
                        return Promise.resolve(fn({ data: mockEdges }));
                      }
                    }
                  }
                  return Promise.resolve(fn({ data: mockNodes }));
                }
                return Promise.resolve(fn({ data: [] }));
              }),
            };
            return mockResult;
          }),
        })),
      },
    } as unknown as DatabaseClient;

    const result = await buildSubgraph(mockDb, ['paper1'], 1, false);

    expect(result.input.nodes.length).toBeGreaterThan(0);
    expect(result.scope.paper_ids).toContain('paper1');
    expect(result.scope.depth).toBe(1);
  });
});

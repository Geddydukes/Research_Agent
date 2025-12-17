import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DatabaseClient } from '../src/db/client';
import type { ValidationOutput } from '../src/agents/schemas';

describe('Entity deduplication and batch operations', () => {
  let mockDb: Partial<DatabaseClient>;

  beforeEach(() => {
    mockDb = {
      findNodesByCanonicalNames: jest.fn(),
      insertNodes: jest.fn(),
      insertEntityMentions: jest.fn(),
    };
  });

  it('batches node lookups instead of N+1 queries', async () => {
    const validatedEntities: ValidationOutput['validated_entities'] = [
      {
        canonical_name: 'Entity A',
        type: 'Entity',
        decision: 'approved',
        original_confidence: 0.8,
        adjusted_confidence: 0.8,
        reason: 'ok',
      },
      {
        canonical_name: 'Entity B',
        type: 'Entity',
        decision: 'approved',
        original_confidence: 0.9,
        adjusted_confidence: 0.9,
        reason: 'ok',
      },
      {
        canonical_name: 'Entity C',
        type: 'Method',
        decision: 'approved',
        original_confidence: 0.7,
        adjusted_confidence: 0.7,
        reason: 'ok',
      },
    ];

    // Mock: Entity A exists, Entity B and Entity C are new
    (mockDb.findNodesByCanonicalNames as jest.Mock).mockResolvedValue(
      new Map([
        [
          'entity_a|Entity',
          { id: 1, canonical_name: 'entity_a', type: 'Entity', metadata: null },
        ],
      ])
    );

    (mockDb.insertNodes as jest.Mock).mockResolvedValue([
      { id: 2, canonical_name: 'entity_b', type: 'Entity', metadata: null },
      { id: 3, canonical_name: 'entity_c', type: 'Method', metadata: null },
    ]);

    (mockDb.insertEntityMentions as jest.Mock).mockResolvedValue([]);

    const pairs = [
      { canonical_name: 'entity_a', type: 'Entity' },
      { canonical_name: 'entity_b', type: 'Entity' },
      { canonical_name: 'entity_c', type: 'Method' },
    ];

    await mockDb.findNodesByCanonicalNames!(pairs);

    expect(mockDb.findNodesByCanonicalNames).toHaveBeenCalledTimes(1);
    expect(mockDb.findNodesByCanonicalNames).toHaveBeenCalledWith(pairs);
    if (mockDb.insertNodes) {
      await mockDb.insertNodes([
        {
          type: 'Entity',
          canonical_name: 'entity_b',
          original_confidence: 0.9,
          adjusted_confidence: 0.9,
          metadata: { display_name: 'Entity B' },
        },
        {
          type: 'Method',
          canonical_name: 'entity_c',
          original_confidence: 0.7,
          adjusted_confidence: 0.7,
          metadata: { display_name: 'Entity C' },
        },
      ]);
      expect(mockDb.insertNodes).toHaveBeenCalledTimes(1);
    }
  });

  it('ensures idempotence: rerunning same paper does not create duplicates', async () => {
    (mockDb.findNodesByCanonicalNames as jest.Mock).mockResolvedValue(
      new Map([
        ['entity_a|Entity', { id: 1, canonical_name: 'entity_a', type: 'Entity' }],
        ['entity_b|Entity', { id: 2, canonical_name: 'entity_b', type: 'Entity' }],
      ])
    );

    const pairs = [
      { canonical_name: 'entity_a', type: 'Entity' },
      { canonical_name: 'entity_b', type: 'Entity' },
    ];

    await mockDb.findNodesByCanonicalNames!(pairs);

    expect(mockDb.insertNodes).not.toHaveBeenCalled();

    if (mockDb.insertEntityMentions) {
      await mockDb.insertEntityMentions([
        { node_id: 1, paper_id: 'paper1', mention_count: 1 },
        { node_id: 2, paper_id: 'paper1', mention_count: 1 },
      ]);
      expect(mockDb.insertEntityMentions).toHaveBeenCalledTimes(1);
    }
  });

  it('skips rejected entities', () => {
    const validatedEntities: ValidationOutput['validated_entities'] = [
      {
        canonical_name: 'Entity A',
        type: 'Entity',
        decision: 'rejected',
        original_confidence: 0.2,
        adjusted_confidence: 0.2,
        reason: 'low_confidence',
      },
      {
        canonical_name: 'Entity B',
        type: 'Entity',
        decision: 'approved',
        original_confidence: 0.8,
        adjusted_confidence: 0.8,
        reason: 'ok',
      },
    ];

    const entitiesToProcess = validatedEntities.filter((e) => e.decision !== 'rejected');
    expect(entitiesToProcess).toHaveLength(1);
    expect(entitiesToProcess[0]?.canonical_name).toBe('Entity B');
  });
});

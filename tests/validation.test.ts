import { describe, it, expect } from '@jest/globals';
import { validateEntitiesAndEdges } from '../src/agents/validationRules';
import type { EntityOutput, EdgeOutput } from '../src/agents/schemas';

describe('validationRules', () => {
  it('rejects low-confidence entities and flags low confidence', () => {
    const entities: EntityOutput['entities'] = [
      {
        type: 'Method',
        canonical_name: 'MethodA',
        original_confidence: 0.2,
      },
      {
        type: 'Method',
        canonical_name: 'MethodB',
        original_confidence: 0.65,
      },
      {
        type: 'Method',
        canonical_name: 'MethodC',
        original_confidence: 0.9,
      },
      {
        type: 'Method',
        canonical_name: 'MethodD',
        original_confidence: 0.9,
      },
    ];
    const edges: EdgeOutput['edges'] = [];

    const result = validateEntitiesAndEdges(entities, edges);
    
    const entitiesByDecision = {
      rejected: result.validated_entities.filter(e => e.decision === 'rejected'),
      flagged: result.validated_entities.filter(e => e.decision === 'flagged'),
      approved: result.validated_entities.filter(e => e.decision === 'approved'),
    };
    
    expect(entitiesByDecision.approved.length).toBeGreaterThan(0);
    expect(entitiesByDecision.rejected.length + entitiesByDecision.flagged.length).toBeGreaterThan(0);
  });

  it('rejects self-referential edges and enforces confidence thresholds', () => {
    const entities: EntityOutput['entities'] = [
      { type: 'Method', canonical_name: 'A', original_confidence: 0.9 },
      { type: 'Method', canonical_name: 'B', original_confidence: 0.9 },
    ];
    const edges: EdgeOutput['edges'] = [
      {
        source_canonical_name: 'A',
        target_canonical_name: 'A',
        source_type: 'Method',
        target_type: 'Method',
        relationship_type: 'uses',
        confidence: 0.9,
        evidence: 'A uses A',
      },
      {
        source_canonical_name: 'A',
        target_canonical_name: 'B',
        source_type: 'Method',
        target_type: 'Method',
        relationship_type: 'uses',
        confidence: 0.4,
        evidence: 'A uses B',
      },
    ];

    const result = validateEntitiesAndEdges(entities, edges);
    expect(result.validated_edges[0]?.decision).toBe('rejected');
    expect(result.validated_edges[0]?.reason).toBe('self_reference');
    expect(result.validated_edges[1]?.decision).toBe('flagged');
  });

  it('applies orphan penalty to single mentions', () => {
    const entities: EntityOutput['entities'] = [
      {
        type: 'Method',
        canonical_name: 'Solo',
        original_confidence: 0.7,
      },
    ];
    const edges: EdgeOutput['edges'] = [];

    const result = validateEntitiesAndEdges(entities, edges);
    expect(result.validated_entities[0]?.adjusted_confidence).toBeCloseTo(0.6, 2);
    expect(result.validated_entities[0]?.decision).toBe('approved');
    expect(result.validated_entities[0]?.reason).toContain('orphan_entity:single_mention');
  });

  it('detects duplicates using bucketed candidate pruning', () => {
    const entities: EntityOutput['entities'] = [
      {
        type: 'Method',
        canonical_name: 'Neural Network',
        original_confidence: 0.9,
      },
      {
        type: 'Method',
        canonical_name: 'Neural Networ',
        original_confidence: 0.85,
      },
      {
        type: 'Method',
        canonical_name: 'CNN',
        original_confidence: 0.9,
      },
      {
        type: 'Dataset',
        canonical_name: 'ImageNet',
        original_confidence: 0.9,
      },
    ];
    const edges: EdgeOutput['edges'] = [];

    const result = validateEntitiesAndEdges(entities, edges);
    
    const neuralEntities = result.validated_entities.filter(e => 
      e.canonical_name.includes('neural')
    );
    
    expect(neuralEntities.length).toBeGreaterThanOrEqual(1);
    
    const hasDuplicate = result.validated_entities.some(
      e => e.reason && (e.reason.includes('duplicate_of:') || e.reason.includes('duplicate_loser'))
    );
    expect(hasDuplicate).toBe(true);
  });
});

import type { EntityOutput, EdgeOutput, ValidationOutput } from './schemas';
import { canonicalize } from '../utils/canonicalize';

type EdgeDecision = ValidationOutput['validated_edges'][number];
type EntityDecision = ValidationOutput['validated_entities'][number];

const CONFIDENCE_REJECT = 0.3;
const CONFIDENCE_REVIEW = 0.6;

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function getBucketKey(canonicalName: string): string {
  const prefix = canonicalName.slice(0, 3).toLowerCase();
  return prefix || '_';
}

function decideConfidence(
  confidence: number
): { decision: 'approved' | 'flagged' | 'rejected'; reason: string } {
  if (confidence < CONFIDENCE_REJECT) {
    return {
      decision: 'rejected',
      reason: `confidence_too_low:${confidence.toFixed(2)}`,
    };
  }
  if (confidence < CONFIDENCE_REVIEW) {
    return {
      decision: 'flagged',
      reason: `low_confidence:${confidence.toFixed(2)}`,
    };
  }
  return { decision: 'approved', reason: 'ok' };
}

export function validateEntitiesAndEdges(
  entities: EntityOutput['entities'],
  edges: EdgeOutput['edges']
): ValidationOutput {
  const canonicalCache = new Map<string, string>();
  const getCanonical = (s: string): string => {
    if (!canonicalCache.has(s)) {
      canonicalCache.set(s, canonicalize(s));
    }
    return canonicalCache.get(s)!;
  };

  const canonicalEntityMap = new Map<string, EntityOutput['entities'][0]>();
  const canonicalToOriginal = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const ent of entities) {
    const canonicalKey = getCanonical(ent.canonical_name);
    if (!canonicalEntityMap.has(canonicalKey)) {
      canonicalEntityMap.set(canonicalKey, ent);
      canonicalToOriginal.set(canonicalKey, ent.canonical_name);
    }
    counts.set(canonicalKey, (counts.get(canonicalKey) || 0) + 1);
  }

  const entitiesByType = new Map<string, Array<{ ent: EntityOutput['entities'][0]; canonicalKey: string }>>();
  for (const ent of Array.from(canonicalEntityMap.values())) {
    const canonicalKey = getCanonical(ent.canonical_name);
    if (!entitiesByType.has(ent.type)) {
      entitiesByType.set(ent.type, []);
    }
    entitiesByType.get(ent.type)!.push({ ent, canonicalKey });
  }

  const bucketsByType = new Map<string, Map<string, Array<{ ent: EntityOutput['entities'][0]; canonicalKey: string }>>>();
  for (const [type, entities] of entitiesByType) {
    const buckets = new Map<string, Array<{ ent: EntityOutput['entities'][0]; canonicalKey: string }>>();
    for (const item of entities) {
      const bucketKey = getBucketKey(item.canonicalKey);
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey)!.push(item);
    }
    bucketsByType.set(type, buckets);
  }

  const entityDecisions: EntityDecision[] = Array.from(canonicalEntityMap.values()).map((ent) => {
    const canonicalKey = getCanonical(ent.canonical_name);
    const original = ent.original_confidence;
    const mentionCount = counts.get(canonicalKey) || 1;
    let adjusted = original;
    let reason = 'ok';

    if (mentionCount <= 1) {
      adjusted = Math.min(1, original * 0.5);
      reason = 'orphan_entity:single_mention';
    }

    const confidenceDecision = decideConfidence(adjusted);
    if (confidenceDecision.reason !== 'ok') {
      reason = confidenceDecision.reason;
    }

    const buckets = bucketsByType.get(ent.type);
    if (buckets) {
      const bucketKey = getBucketKey(canonicalKey);
      const candidates = buckets.get(bucketKey) || [];
      
      for (const candidate of candidates) {
        if (candidate.ent === ent) continue;
        if (levenshtein(canonicalKey, candidate.canonicalKey) < 3) {
          if (confidenceDecision.decision === 'approved') {
            reason = `duplicate_candidate:${candidate.ent.canonical_name}`;
          }
          break;
        }
      }
    }

    return {
      canonical_name: canonicalKey,
      type: ent.type,
      decision: confidenceDecision.decision,
      original_confidence: original,
      adjusted_confidence: adjusted,
      reason,
    };
  });

  const edgeDecisions: EdgeDecision[] = edges.map((edge) => {
    const sourceCanonical = getCanonical(edge.source_canonical_name);
    const targetCanonical = getCanonical(edge.target_canonical_name);

    if (sourceCanonical === targetCanonical) {
      return {
        source_canonical_name: sourceCanonical,
        target_canonical_name: targetCanonical,
        relationship_type: edge.relationship_type,
        decision: 'rejected',
        confidence: edge.confidence,
        reason: 'self_reference',
      };
    }

    const confidenceDecision = decideConfidence(edge.confidence);
    return {
      source_canonical_name: sourceCanonical,
      target_canonical_name: targetCanonical,
      relationship_type: edge.relationship_type,
      decision: confidenceDecision.decision,
      confidence: edge.confidence,
      reason: confidenceDecision.reason,
    };
  });

  return {
    validated_entities: entityDecisions,
    validated_edges: edgeDecisions,
  };
}

import type { EntityOutput, EdgeOutput, ValidationOutput } from './schemas';
import { canonicalize } from '../utils/canonicalize';

type EdgeDecision = ValidationOutput['validated_edges'][number];
type EntityDecision = ValidationOutput['validated_entities'][number];

const CONFIDENCE_REJECT = 0.3;
const CONFIDENCE_REVIEW = 0.6;
const ORPHAN_PENALTY = 0.10; // Additive penalty for single-mention entities
const VALIDATION_DEBUG = process.env.VALIDATION_DEBUG === '1';

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

function computeStats(values: number[]): {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p90: number;
} {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p90: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
  };
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

  // Build set of valid canonical entity keys for edge validation
  const validEntityKeys = new Set(canonicalEntityMap.keys());

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

  // First pass: compute adjusted confidence and collect duplicate groups
  type EntityWithMetadata = {
    ent: EntityOutput['entities'][0];
    canonicalKey: string;
    original: number;
    adjusted: number;
    mentionCount: number;
    reasons: string[];
    duplicateGroup?: Array<{ ent: EntityOutput['entities'][0]; canonicalKey: string }>;
  };

  const entityMetadata = new Map<string, EntityWithMetadata>();

  for (const ent of Array.from(canonicalEntityMap.values())) {
    const canonicalKey = getCanonical(ent.canonical_name);
    const original = ent.original_confidence;
    const mentionCount = counts.get(canonicalKey) || 1;
    const reasons: string[] = [];

    // Apply orphan penalty: additive instead of multiplicative
    let adjusted = original;
    if (mentionCount <= 1) {
      adjusted = Math.max(0, original - ORPHAN_PENALTY);
      reasons.push('orphan_entity:single_mention');
    }

    // Find duplicate candidates
    const duplicateGroup: Array<{ ent: EntityOutput['entities'][0]; canonicalKey: string }> = [];
    const buckets = bucketsByType.get(ent.type);
    if (buckets) {
      const bucketKey = getBucketKey(canonicalKey);
      const candidates = buckets.get(bucketKey) || [];
      
      for (const candidate of candidates) {
        if (candidate.ent === ent) continue;
        if (levenshtein(canonicalKey, candidate.canonicalKey) < 3) {
          duplicateGroup.push(candidate);
        }
      }
    }

    entityMetadata.set(canonicalKey, {
      ent,
      canonicalKey,
      original,
      adjusted,
      mentionCount,
      reasons,
      duplicateGroup: duplicateGroup.length > 0 ? duplicateGroup : undefined,
    });
  }

  // Second pass: resolve duplicates deterministically
  const duplicateLosers = new Set<string>();
  const processedGroups = new Set<string>();

  for (const [canonicalKey, metadata] of entityMetadata) {
    if (duplicateLosers.has(canonicalKey) || !metadata.duplicateGroup) continue;

    // Build full duplicate group including self
    const groupKeys = new Set<string>([canonicalKey]);
    for (const candidate of metadata.duplicateGroup) {
      const candidateKey = getCanonical(candidate.ent.canonical_name);
      if (!duplicateLosers.has(candidateKey)) {
        groupKeys.add(candidateKey);
      }
    }

    if (groupKeys.size < 2) continue;

    // Create a stable key for this group to avoid processing twice
    const sortedKeys = Array.from(groupKeys).sort();
    const groupKey = sortedKeys.join('|');
    if (processedGroups.has(groupKey)) continue;
    processedGroups.add(groupKey);

    // Build group with metadata
    const group = sortedKeys
      .map((key) => {
        const meta = entityMetadata.get(key);
        return meta ? { canonicalKey: key, adjusted: meta.adjusted, metadata: meta } : null;
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);

    if (group.length < 2) continue;

    // Pick winner: higher adjusted_confidence, tie-break lexicographically
    group.sort((a, b) => {
      if (Math.abs(a.adjusted - b.adjusted) > 0.001) {
        return b.adjusted - a.adjusted;
      }
      return a.canonicalKey.localeCompare(b.canonicalKey);
    });

    const winner = group[0];
    const losers = group.slice(1);

    // Mark losers
    for (const loser of losers) {
      duplicateLosers.add(loser.canonicalKey);
      loser.metadata.reasons.push(`duplicate_of:${winner.canonicalKey}`);
      // Override decision: if winner is approved, loser is flagged; otherwise rejected
      const winnerDecision = decideConfidence(winner.adjusted).decision;
      if (winnerDecision === 'approved') {
        loser.metadata.reasons.push('duplicate_loser:flagged');
      } else {
        loser.metadata.reasons.push('duplicate_loser:rejected');
      }
    }
  }

  // Third pass: build final entity decisions with composable reasons
  const entityDecisions: EntityDecision[] = Array.from(entityMetadata.values()).map((metadata) => {
    // Skip if marked as duplicate loser (will be handled below)
    if (duplicateLosers.has(metadata.canonicalKey)) {
      // Override decision based on duplicate resolution
      const hasRejected = metadata.reasons.some((r) => r.includes('duplicate_loser:rejected'));
      const decision = hasRejected ? 'rejected' : 'flagged';

      return {
        canonical_name: metadata.canonicalKey,
        type: metadata.ent.type,
        decision,
        original_confidence: metadata.original,
        adjusted_confidence: metadata.adjusted,
        reason: metadata.reasons.join(';'),
      };
    }

    const confidenceDecision = decideConfidence(metadata.adjusted);
    if (confidenceDecision.reason !== 'ok') {
      metadata.reasons.push(confidenceDecision.reason);
    }

    return {
      canonical_name: metadata.canonicalKey,
      type: metadata.ent.type,
      decision: confidenceDecision.decision,
      original_confidence: metadata.original,
      adjusted_confidence: metadata.adjusted,
      reason: metadata.reasons.length > 0 ? metadata.reasons.join(';') : 'ok',
    };
  });

  // Edge validation with endpoint consistency check
  const edgeDecisions: EdgeDecision[] = edges.map((edge) => {
    const sourceCanonical = getCanonical(edge.source_canonical_name);
    const targetCanonical = getCanonical(edge.target_canonical_name);
    const reasons: string[] = [];

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

    // Check endpoint consistency - structural invalidity, so reject
    const hasUnknownEndpoint = !validEntityKeys.has(sourceCanonical) || !validEntityKeys.has(targetCanonical);
    if (!validEntityKeys.has(sourceCanonical)) {
      reasons.push(`unknown_endpoint:source:${sourceCanonical}`);
    }
    if (!validEntityKeys.has(targetCanonical)) {
      reasons.push(`unknown_endpoint:target:${targetCanonical}`);
    }

    // If unknown endpoint, reject immediately (structurally invalid)
    if (hasUnknownEndpoint) {
      return {
        source_canonical_name: sourceCanonical,
        target_canonical_name: targetCanonical,
        relationship_type: edge.relationship_type,
        decision: 'rejected',
        confidence: edge.confidence,
        reason: reasons.join(';'),
      };
    }

    const confidenceDecision = decideConfidence(edge.confidence);
    if (confidenceDecision.reason !== 'ok') {
      reasons.push(confidenceDecision.reason);
    }

    return {
      source_canonical_name: sourceCanonical,
      target_canonical_name: targetCanonical,
      relationship_type: edge.relationship_type,
      decision: confidenceDecision.decision,
      confidence: edge.confidence,
      reason: reasons.length > 0 ? reasons.join(';') : 'ok',
    };
  });

  // Debug logging
  if (VALIDATION_DEBUG) {
    const originalConfidences = entityDecisions.map((e) => e.original_confidence);
    const adjustedConfidences = entityDecisions.map((e) => e.adjusted_confidence);
    const originalStats = computeStats(originalConfidences);
    const adjustedStats = computeStats(adjustedConfidences);

    const entityCounts = {
      approved: entityDecisions.filter((e) => e.decision === 'approved').length,
      flagged: entityDecisions.filter((e) => e.decision === 'flagged').length,
      rejected: entityDecisions.filter((e) => e.decision === 'rejected').length,
    };

    const edgeCounts = {
      approved: edgeDecisions.filter((e) => e.decision === 'approved').length,
      flagged: edgeDecisions.filter((e) => e.decision === 'flagged').length,
      rejected: edgeDecisions.filter((e) => e.decision === 'rejected').length,
    };

    console.log('[VALIDATION_DEBUG] Entity Confidence Distribution:');
    console.log(`  Original: min=${originalStats.min.toFixed(3)}, max=${originalStats.max.toFixed(3)}, mean=${originalStats.mean.toFixed(3)}, p50=${originalStats.p50.toFixed(3)}, p90=${originalStats.p90.toFixed(3)}`);
    console.log(`  Adjusted: min=${adjustedStats.min.toFixed(3)}, max=${adjustedStats.max.toFixed(3)}, mean=${adjustedStats.mean.toFixed(3)}, p50=${adjustedStats.p50.toFixed(3)}, p90=${adjustedStats.p90.toFixed(3)}`);
    console.log(`[VALIDATION_DEBUG] Entity Decisions: approved=${entityCounts.approved}, flagged=${entityCounts.flagged}, rejected=${entityCounts.rejected}`);
    console.log(`[VALIDATION_DEBUG] Edge Decisions: approved=${edgeCounts.approved}, flagged=${edgeCounts.flagged}, rejected=${edgeCounts.rejected}`);
  }

  return {
    validated_entities: entityDecisions,
    validated_edges: edgeDecisions,
  };
}

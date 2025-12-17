import { z } from 'zod';

export const IngestionSchema = z.object({
  paper_id: z.string(),
  title: z.string(),
  year: z.number().int().nullable(),
  authors: z.array(z.string()),
  sections: z.array(
    z.object({
      section_type: z.enum([
        'abstract',
        'methods',
        'results',
        'related_work',
        'conclusion',
        'other',
      ]),
      content: z.string(),
      word_count: z.number().int(),
      part_index: z.number().int(),
    })
  ),
  warnings: z.array(z.string()),
});

export type IngestionOutput = z.infer<typeof IngestionSchema>;

export const EntitySchema = z.object({
  entities: z
    .array(
      z.object({
        type: z.string(),
        canonical_name: z.string(),
        original_confidence: z.number().min(0).max(1),
        adjusted_confidence: z.number().min(0).max(1).optional(),
        metadata: z.record(z.string(), z.any()).optional(),
        part_index: z.number().int().optional(),
        section_type: z.string().optional(),
      })
    )
    .max(10),
});

export type EntityOutput = z.infer<typeof EntitySchema>;

export const RelationshipCoreSchema = z.object({
  relationships: z
    .array(
      z.object({
        source_canonical_name: z.string(),
        target_canonical_name: z.string(),
        relationship_type: z.string(),
        confidence: z.number().min(0).max(1),
      })
    )
    .max(12),
});

export type RelationshipCoreOutput = z.infer<typeof RelationshipCoreSchema>;

export const RelationshipEvidenceSchema = z.object({
  evidence: z.array(
    z.object({
      edge_key: z.string(),
      evidence: z.string().max(300),
      section_id: z.number().int().optional(),
      section_type: z.string().optional(),
      part_index: z.number().int().optional(),
    })
  ),
});

export type RelationshipEvidenceOutput = z.infer<typeof RelationshipEvidenceSchema>;

export const EdgeSchema = z.object({
  edges: z.array(
    z.object({
      source_canonical_name: z.string(),
      target_canonical_name: z.string(),
      source_type: z.string(),
      target_type: z.string(),
      relationship_type: z.string(),
      confidence: z.number().min(0).max(1),
      evidence: z.string(),
      baseline_name: z.string().optional(),
      provenance: z
        .object({
          section_type: z.string().optional(),
          part_index: z.number().int().optional(),
          paper_id: z.string().optional(),
        })
        .optional(),
    })
  ),
});

export type EdgeOutput = z.infer<typeof EdgeSchema>;

export const ValidationSchema = z.object({
  validated_entities: z.array(
    z.object({
      canonical_name: z.string(),
      type: z.string(),
      decision: z.enum(['approved', 'flagged', 'rejected']),
      original_confidence: z.number().min(0).max(1),
      adjusted_confidence: z.number().min(0).max(1),
      reason: z.string().optional(),
    })
  ),
  validated_edges: z.array(
    z.object({
      source_canonical_name: z.string(),
      target_canonical_name: z.string(),
      relationship_type: z.string(),
      decision: z.enum(['approved', 'flagged', 'rejected']),
      confidence: z.number().min(0).max(1),
      reason: z.string().optional(),
    })
  ),
});

export type ValidationOutput = z.infer<typeof ValidationSchema>;

export const InsightSchema = z.object({
  insights: z.array(
    z.object({
      insight_type: z.enum([
        'transitive_relationship',
        'cluster_analysis',
        'anomaly_detection',
        'gap_identification',
        'trend_analysis',
      ]),
      subject_nodes: z.array(z.string()),
      reasoning_path: z
        .object({
          steps: z.array(z.string()),
          confidence: z.number().min(0).max(1),
        })
        .optional(),
      confidence: z.number().min(0).max(1),
      description: z.string(),
    })
  ),
});

export type InsightOutput = z.infer<typeof InsightSchema>;

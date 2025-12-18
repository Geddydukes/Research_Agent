-- ============================================================================
-- SQL QUERIES FOR AI RESEARCH DISCOVERY AGENT
-- ============================================================================
-- These queries demonstrate common research-discovery workflows over the
-- knowledge graph. All queries are designed to work with the Postgres schema
-- defined in sql/schema.sql.
--
-- To execute these queries:
-- 1. Connect to your Supabase/Postgres database
-- 2. Run each query individually or as a script
-- 3. Example output (from my run) is included below each query; your results may vary.
--
-- Optional psql settings for better output:
-- \timing on          -- Show query execution time
-- \x auto             -- Auto-expand wide results
-- SET search_path TO public;  -- Ensure correct schema
-- ============================================================================

-- ============================================================================
-- QUERY 1: Papers that improve on 3D Gaussian Splatting
-- ============================================================================
-- Purpose: Find all papers that claim to improve on the 3D Gaussian Splatting
-- method, ordered by confidence and year.
-- 
-- 
-- Expected columns: paper_id, title, year, confidence, evidence, source_entity, source_type

SELECT DISTINCT 
  p.paper_id,
  p.title,
  p.year,
  e.confidence, 
  e.evidence,
  source_node.canonical_name AS source_entity,
  source_node.type AS source_type
FROM edges e
JOIN nodes target_node ON e.target_node_id = target_node.id
JOIN nodes source_node ON e.source_node_id = source_node.id
LEFT JOIN papers p ON p.paper_id = e.provenance->'meta'->>'source_paper_id'
WHERE e.relationship_type = 'improves_on'
  AND target_node.canonical_name = '3d_gaussian_splatting'
  AND target_node.type = 'Method'
  AND e.confidence >= 0.6
  AND e.provenance->'meta'->>'source_paper_id' IS NOT NULL
ORDER BY e.confidence DESC, p.year DESC
LIMIT 10;

-- ACTUAL OUTPUT (executed on database):
-- paper_id                                    | title                                                      | year | confidence | evidence                                                                 | source_entity   | source_type
-- --------------------------------------------|-----------------------------------------------------------|------|------------|--------------------------------------------------------------------------|-----------------|------------
-- 2312_02155v3                                | GPS-Gaussian: Generalizable Pixel-wise 3D Gaussian...    | null | 0.9        | Quantitative comparisons against state-of-the-art generalizable methods... | gps_gaussian    | Method
-- fc54a8f8272688851fdd5dfbf9f1deacbe39eb30   | 4D-Rotor Gaussian Splatting: Towards Efficient Novel... | 2024 | 0.9        | null                                                                      | 4drotorgs       | Method
-- 2501_11102v1                                | RDG-GS: Relative Depth Guidance with Gaussian Splatting  | 2025 | 0.85       | RDG-GS achieves state-of-the-art performance on Mip-NeRF360...            | rdg_gs          | Method
--

-- ============================================================================
-- QUERY 2: Concepts most central to the corpus (by edge degree)
-- ============================================================================
-- Purpose: Identify the most central concepts in the knowledge graph by
-- counting total edges (incoming + outgoing) and papers mentioning them.
--
--
-- Expected columns: canonical_name, type, total_edges, papers_mentioning

SELECT n.canonical_name, n.type,
       COALESCE(in_degree.count, 0) + COALESCE(out_degree.count, 0) AS total_edges,
       COUNT(DISTINCT em.paper_id) AS papers_mentioning
FROM nodes n
LEFT JOIN (
  SELECT target_node_id AS node_id, COUNT(*) AS count
  FROM edges
  GROUP BY target_node_id
) in_degree ON in_degree.node_id = n.id
LEFT JOIN (
  SELECT source_node_id AS node_id, COUNT(*) AS count
  FROM edges
  GROUP BY source_node_id
) out_degree ON out_degree.node_id = n.id
LEFT JOIN entity_mentions em ON em.node_id = n.id
WHERE n.type = 'Concept'
GROUP BY n.id, n.canonical_name, n.type, in_degree.count, out_degree.count
ORDER BY total_edges DESC, papers_mentioning DESC
LIMIT 20;

-- ACTUAL OUTPUT (executed on database):
-- canonical_name            | type    | total_edges | papers_mentioning
-- -------------------------|---------|-------------|-------------------
-- novel_view_synthesis     | Concept | 5           | 6
-- 3d_gaussians             | Concept | 3           | 2
-- anisotropic Gaussian... | Concept | 3           | 1
-- 3D Gaussians             | Concept | 2           | 2
-- isotropic Gaussian...    | Concept | 2           | 1

-- ============================================================================
-- QUERY 3: Semantic edges between entities with evidence
-- ============================================================================
-- Purpose: Find semantic relationships between entities (methods, concepts, etc.)
-- with their evidence quotes and source paper information.
--
--
-- Expected columns: id, relationship_type, confidence, evidence, source/target
-- entities and types, evidence_section, source_paper_id, source_paper_title

SELECT e.id, e.relationship_type, e.confidence, e.evidence,
       source_node.canonical_name AS source_entity,
       source_node.type AS source_type,
       target_node.canonical_name AS target_entity,
       target_node.type AS target_type,
       e.provenance->>'section_type' AS evidence_section,
       e.provenance->'meta'->>'source_paper_id' AS source_paper_id,
       p.title AS source_paper_title
FROM edges e
JOIN nodes source_node ON e.source_node_id = source_node.id
JOIN nodes target_node ON e.target_node_id = target_node.id
LEFT JOIN papers p ON p.paper_id = e.provenance->'meta'->>'source_paper_id'
WHERE e.evidence IS NOT NULL
  AND e.provenance->'meta'->>'source_paper_id' IS NOT NULL
  AND e.confidence >= 0.85
ORDER BY e.confidence DESC
LIMIT 10;

-- ACTUAL OUTPUT (executed on database):
-- id  | relationship_type | confidence | source_entity | target_entity | evidence_section | source_paper_id
-- ----|-------------------|------------|---------------|---------------|-----------------|----------------
-- 297 | introduces        | 1.0        | RadSplat      | pruning       | abstract         | 9942392f8f7c...
-- 960 | evaluates         | 1.0        | mip_splatting | mip_nerf_360...| results          | 2311_16493v1
-- 964 | introduces        | 1.0        | mip_splatting | 2d_mip_filter | methods          | 2311_16493v1
-- 298 | introduces        | 1.0        | RadSplat      | viewpoint-... | abstract         | 9942392f8f7c...
-- 965 | introduces        | 1.0        | mip_splatting | 3d_smoothing...| methods          | 2311_16493v1

-- ============================================================================
-- QUERY 4: Insights generated for the latest reasoning batch
-- ============================================================================
-- Purpose: Retrieve all insights from the most recent reasoning batch that has
-- subject_nodes populated, including their claims and subject node names.
--
-- Expected columns: id, insight_type, confidence, claim, batch_id, steps,
-- subject_node_names

SELECT i.id, i.insight_type, i.confidence,
       i.reasoning_path->>'claim' AS claim,
       i.reasoning_path->'meta'->>'batch_id' AS batch_id,
       i.reasoning_path->'steps' AS steps,
       array_agg(DISTINCT n.canonical_name ORDER BY n.canonical_name) AS subject_node_names
FROM inferred_insights i
CROSS JOIN LATERAL unnest(i.subject_nodes) AS node_id
JOIN nodes n ON n.id = node_id
WHERE i.reasoning_path->'meta'->>'batch_id' = (
  SELECT reasoning_path->'meta'->>'batch_id'
  FROM inferred_insights
  WHERE reasoning_path->'meta'->>'batch_id' IS NOT NULL
    AND array_length(subject_nodes, 1) > 0
  ORDER BY created_at DESC
  LIMIT 1
)
  AND array_length(i.subject_nodes, 1) > 0
GROUP BY i.id, i.insight_type, i.confidence, i.reasoning_path
ORDER BY i.confidence DESC;

-- ACTUAL OUTPUT (executed on database):
-- id  | insight_type          | confidence | batch_id                            | subject_node_names
-- ----|-----------------------|-----------|-------------------------------------|-------------------
-- 48  | transitive_relationship | 0.765    | 03b79945-7151-4a14-8f05-f55852ddd94b | {InstantNGP, RadSplat}
-- 49  | transitive_relationship | 0.765    | 03b79945-7151-4a14-8f05-f55852ddd94b | {InstantNGP, Triangle Splatting}
-- 50  | transitive_relationship | 0.765    | 03b79945-7151-4a14-8f05-f55852ddd94b | {Plenoxels, RadSplat}
-- 51  | transitive_relationship | 0.765    | 03b79945-7151-4a14-8f05-f55852ddd94b | {Plenoxels, Triangle Splatting}
-- 52  | anomaly_detection     | 0.7       | 03b79945-7151-4a14-8f05-f55852ddd94b | {2403_14244v1}

-- ============================================================================
-- QUERY 5a: Methods that use a specific dataset (filtered)
-- ============================================================================
-- Purpose: Find all methods that use a particular dataset (e.g., Mip-NeRF 360)
-- with their confidence scores and evidence.
--
-- Expected columns: method_name, paper_id, title, year, confidence, evidence

SELECT DISTINCT m.canonical_name AS method_name,
       p.paper_id, p.title, p.year,
       e.confidence, e.evidence
FROM nodes m
JOIN edges e ON e.source_node_id = m.id
JOIN nodes d ON e.target_node_id = d.id
LEFT JOIN papers p ON p.paper_id = e.provenance->'meta'->>'source_paper_id'
WHERE m.type = 'Method'
  AND d.type = 'Dataset'
  AND d.canonical_name = 'mip_nerf_360'
  AND e.relationship_type = 'uses'
  AND e.confidence >= 0.6
  AND e.provenance->'meta'->>'source_paper_id' IS NOT NULL
ORDER BY e.confidence DESC, p.year DESC;

-- ACTUAL OUTPUT (executed on database):
-- Result: Empty set (no methods found using 'mip_nerf_360' dataset with valid provenance)

-- ============================================================================
-- QUERY 5b: Methods that use any dataset (unfiltered)
-- ============================================================================
-- Purpose: Find all methods that use any dataset, useful for exploring available
-- method-dataset relationships when a specific dataset filter returns no results.
--
-- Expected columns: method_name, dataset_name, paper_id, title, year, confidence, evidence

SELECT DISTINCT m.canonical_name AS method_name,
       d.canonical_name AS dataset_name,
       p.paper_id, p.title, p.year,
       e.confidence, e.evidence
FROM nodes m
JOIN edges e ON e.source_node_id = m.id
JOIN nodes d ON e.target_node_id = d.id
LEFT JOIN papers p ON p.paper_id = e.provenance->'meta'->>'source_paper_id'
WHERE m.type = 'Method'
  AND d.type = 'Dataset'
  AND e.relationship_type = 'uses'
  AND e.confidence >= 0.6
  AND e.provenance->'meta'->>'source_paper_id' IS NOT NULL
ORDER BY e.confidence DESC, p.year DESC
LIMIT 10;

-- ACTUAL OUTPUT (executed on database):
-- method_name           | dataset_name    | paper_id | title | year | confidence | evidence
-- ----------------------|-----------------|----------|-------|------|------------|----------
-- 4d_gs                 | d_nerf_dataset  | 395bfd... | 4D Gaussian Splatting... | 2024 | 0.9 | null
-- 4d_gs                 | hypernerf       | 395bfd... | 4D Gaussian Splatting... | 2024 | 0.9 | null
-- 3d_gaussian_splatting | gauu_scene      | 2403_11134v2 | Recent Advances... | 2024 | 0.6 | null

-- ============================================================================
-- QUERY 5c: Dataset name discovery helper
-- ============================================================================
-- Purpose: Find dataset names matching a pattern, useful when Query 5a returns
-- empty due to canonicalization differences (e.g., 'mip_nerf_360' vs 'MipNeRF360').
--
-- Expected columns: dataset_name, type

SELECT DISTINCT n.canonical_name AS dataset_name, n.type
FROM nodes n
WHERE n.type = 'Dataset'
  AND n.canonical_name ILIKE '%mip%'  -- Example: search for datasets containing 'mip'
ORDER BY n.canonical_name;

-- ACTUAL OUTPUT (executed on database):
-- dataset_name          | type
-- ----------------------|-----
-- mip_nerf_360_dataset  | Dataset
-- mip_nerf360           | Dataset
-- Mip-NeRF 360          | Dataset
-- MipNeRF360            | Dataset
--

-- ============================================================================
-- QUERY 6: Papers with highest entity extraction yield
-- ============================================================================
-- Purpose: Identify papers from which the most entities and relationships
-- were successfully extracted, indicating rich semantic content.
--
-- Expected columns: paper_id, title, year, entities_extracted,
-- relationships_extracted

SELECT p.paper_id, p.title, p.year,
       COUNT(DISTINCT em.node_id) AS entities_extracted,
       COUNT(DISTINCT e.id) AS relationships_extracted
FROM papers p
LEFT JOIN entity_mentions em ON em.paper_id = p.paper_id
LEFT JOIN nodes n ON n.id = em.node_id
LEFT JOIN edges e ON (e.source_node_id = n.id OR e.target_node_id = n.id)
  AND e.provenance->'meta'->>'source_paper_id' = p.paper_id
GROUP BY p.paper_id, p.title, p.year
ORDER BY entities_extracted DESC, relationships_extracted DESC
LIMIT 20;

-- ACTUAL OUTPUT (executed on database):
-- paper_id      | title | year | entities_extracted | relationships_extracted
-- --------------|-------|------|-------------------|------------------------
-- 2403_14244v1  | ISOTROPIC GAUSSIAN SPLATTING... | null | 22 | 0
-- 2308_04079v1  | 3D Gaussian Splatting... | 2023 | 18 | 9
-- 2403_13806v2  | RadSplat: Radiance Field... | 2025 | 13 | 11
-- 2308.04079    | 3D Gaussian Splatting... | 2023 | 12 | 0
-- fc54a8f827... | 4D-Rotor Gaussian Splatting... | 2024 | 10 | 12

-- ============================================================================
-- QUERY 7: Transitive improvement chains (via insights)
-- ============================================================================
-- Purpose: Find multi-hop improvement chains inferred by the reasoning agent,
-- showing how methods indirectly advance each other.
--
-- Expected columns: id, insight_type, confidence, claim, steps, chain_nodes

SELECT i.id, i.insight_type, i.confidence,
       i.reasoning_path->>'claim' AS claim,
       i.reasoning_path->'steps' AS steps,
       array_agg(DISTINCT n.canonical_name ORDER BY n.canonical_name) AS chain_nodes
FROM inferred_insights i
CROSS JOIN LATERAL unnest(i.subject_nodes) AS node_id
JOIN nodes n ON n.id = node_id
WHERE i.insight_type = 'transitive_relationship'
  AND i.confidence >= 0.7
GROUP BY i.id, i.insight_type, i.confidence, i.reasoning_path
ORDER BY i.confidence DESC
LIMIT 10;

-- ACTUAL OUTPUT (executed on database):
-- id  | insight_type          | confidence | chain_nodes
-- ----|-----------------------|-----------|-------------------
-- 20  | transitive_relationship | 0.855    | {2403_14244v1, Mip-NeRF}
-- 17  | transitive_relationship | 0.855    | {NeRF, weighted isotropic Gaussian kernels}
-- 18  | transitive_relationship | 0.855    | {Mip-NeRF, weighted isotropic Gaussian kernels}
-- 19  | transitive_relationship | 0.855    | {2403_14244v1, NeRF}
-- 38  | transitive_relationship | 0.855    | {NeRF, RadSplat}

-- ============================================================================
-- QUERY 8: Flagged entities requiring review
-- ============================================================================
-- Purpose: Identify entities that were flagged during validation (confidence
-- 0.3-0.6) and may need human review for quality assurance.
--
-- Expected columns: id, canonical_name, type, adjusted_confidence, reasons,
-- paper_id, title

SELECT n.id, n.canonical_name, n.type, n.adjusted_confidence,
       n.review_reasons AS reasons,
       p.paper_id, p.title
FROM nodes n
JOIN entity_mentions em ON em.node_id = n.id
JOIN papers p ON p.paper_id = em.paper_id
WHERE n.adjusted_confidence >= 0.3
  AND n.adjusted_confidence < 0.6
  AND (n.review_reasons IS NOT NULL OR n.review_status = 'flagged')
ORDER BY n.adjusted_confidence ASC;

-- ACTUAL OUTPUT (executed on database):
-- id  | canonical_name | type    | adjusted_confidence | reasons                                    | paper_id                                    | title
-- ----|----------------|---------|---------------------|--------------------------------------------|---------------------------------------------|---------------------------------------------------
-- 111 | particles      | Concept | 0.5                 | orphan_entity:single_mention;low_confidence:0.50 | 67125bc119b09520dc45ed401644db0516eb9d30 | Isotropic Gaussian Splatting for Real-Time Radiance Field Rendering

-- ============================================================================
-- QUERY 9: Most evaluated datasets (by number of evaluates edges)
-- ============================================================================
-- Purpose: Identify the most commonly used datasets for evaluation across
-- the corpus, indicating benchmark popularity.
--
--
-- Expected columns: dataset_name, evaluation_count, papers_evaluating,
-- avg_confidence

SELECT n.canonical_name AS dataset_name,
       COUNT(DISTINCT e.id) AS evaluation_count,
       COUNT(DISTINCT e.provenance->'meta'->>'source_paper_id') AS papers_evaluating,
       AVG(e.confidence) AS avg_confidence
FROM nodes n
JOIN edges e ON e.target_node_id = n.id
WHERE n.type = 'Dataset'
  AND e.relationship_type = 'evaluates'
  AND e.provenance->'meta'->>'source_paper_id' IS NOT NULL
GROUP BY n.id, n.canonical_name
ORDER BY evaluation_count DESC
LIMIT 10;

-- ACTUAL OUTPUT (executed on database):
-- dataset_name      | evaluation_count | papers_evaluating | avg_confidence
-- ------------------|------------------|--------------------|----------------
-- MipNeRF360        | 5                | 5                  | 0.88
-- Tanks and Temples | 4                | 4                  | 0.85
-- NeRF Synthetic    | 2                | 2                  | 0.775
-- Mip-NeRF 360      | 2                | 2                  | 0.85

-- ============================================================================
-- QUERY 10: Papers with missing evaluations (anomaly detection)
-- ============================================================================
-- Purpose: Find papers that claim improvements but lack evaluation edges to
-- datasets, which may indicate incomplete extraction or missing evaluation
-- sections.
--
--
-- Expected columns: paper_id, title, year, improves_on_count, evaluates_count

SELECT p.paper_id, p.title, p.year,
       COUNT(DISTINCT e_improves.id) AS improves_on_count,
       COUNT(DISTINCT e_eval.id) AS evaluates_count
FROM papers p
LEFT JOIN edges e_improves ON e_improves.provenance->'meta'->>'source_paper_id' = p.paper_id
  AND e_improves.relationship_type = 'improves_on'
LEFT JOIN edges e_eval ON e_eval.provenance->'meta'->>'source_paper_id' = p.paper_id
  AND e_eval.relationship_type = 'evaluates'
  AND EXISTS (
    SELECT 1 FROM nodes d
    WHERE d.id = e_eval.target_node_id AND d.type = 'Dataset'
  )
GROUP BY p.paper_id, p.title, p.year
HAVING COUNT(DISTINCT e_improves.id) > 0
  AND COUNT(DISTINCT e_eval.id) = 0
ORDER BY improves_on_count DESC;

-- ACTUAL OUTPUT (executed on database):
-- paper_id                                    | title                                                    | year | improves_on_count | evaluates_count
-- --------------------------------------------|----------------------------------------------------------|------|-------------------|----------------
-- 2403_11134v2                                | Recent Advances in 3D Gaussian Splatting                  | 2024 | 3                 | 0
-- 395bfdae59f1a5fde16213cade43d2587e4565df   | 4D Gaussian Splatting for Real-Time Dynamic Scene...     | 2024 | 2                 | 0
-- 941ada3e24e6f54bb49cfaeff998f4f5cbac5a38   | Speedy-Splat: Fast 3D Gaussian Splatting with Sparse...  | 2024 | 2                 | 0
-- 9c0d40f01ced7d425cb6145e9f961c6e44a478a8   | 2D Gaussian Splatting for Geometrically Accurate...     | 2024 | 2                 | 0

-- ============================================================================
-- QUERY 11: Evidence coverage analysis
-- ============================================================================
-- Purpose: Measure how complete evidence enrichment is across the knowledge graph.
--
-- Expected columns: relationship_type, total_edges, edges_with_evidence,
-- edges_without_evidence, evidence_coverage_pct

SELECT 
  e.relationship_type,
  COUNT(*) AS total_edges,
  COUNT(e.evidence) FILTER (WHERE e.evidence IS NOT NULL) AS edges_with_evidence,
  COUNT(*) FILTER (WHERE e.evidence IS NULL) AS edges_without_evidence,
  ROUND(
    100.0 * COUNT(e.evidence) FILTER (WHERE e.evidence IS NOT NULL) / COUNT(*),
    2
  ) AS evidence_coverage_pct
FROM edges e
GROUP BY e.relationship_type
ORDER BY evidence_coverage_pct DESC, total_edges DESC;

-- ACTUAL OUTPUT (executed on database):
-- relationship_type | total_edges | edges_with_evidence | edges_without_evidence | evidence_coverage_pct
-- -----------------|-------------|---------------------|----------------------|----------------------
-- compares_to      | 15          | 13                  | 2                     | 86.67
-- improves_on      | 53          | 44                  | 9                     | 83.02
-- introduces       | 43          | 35                  | 8                     | 81.40
-- extends          | 16          | 13                  | 3                     | 81.25
-- evaluates        | 83          | 66                  | 17                    | 79.52
-- uses             | 57          | 43                  | 14                    | 75.44

-- ============================================================================
-- QUERY 12: Low-confidence edges for review
-- ============================================================================
-- Purpose: Identify edges with low confidence scores that may need human review
-- or indicate extraction quality issues. Useful for audit workflows.
--
-- Expected columns: id, relationship_type, confidence, source_entity, target_entity,
-- source_paper_id, source_paper_title

SELECT 
  e.id,
  e.relationship_type,
  e.confidence,
  source_node.canonical_name AS source_entity,
  source_node.type AS source_type,
  target_node.canonical_name AS target_entity,
  target_node.type AS target_type,
  e.provenance->'meta'->>'source_paper_id' AS source_paper_id,
  p.title AS source_paper_title,
  e.evidence
FROM edges e
JOIN nodes source_node ON e.source_node_id = source_node.id
JOIN nodes target_node ON e.target_node_id = target_node.id
LEFT JOIN papers p ON p.paper_id = e.provenance->'meta'->>'source_paper_id'
WHERE e.confidence >= 0.3
  AND e.confidence < 0.6
  AND e.provenance->'meta'->>'source_paper_id' IS NOT NULL
ORDER BY e.confidence ASC, e.relationship_type
LIMIT 20;

-- ACTUAL OUTPUT (executed on database):
-- Result: Empty set (no edges found with confidence 0.3-0.6 and valid source_paper_id)

-- ============================================================================
-- QUERY 13: Provenance coverage analysis
-- ============================================================================
-- Purpose: Measure how complete provenance metadata is across edges.
--
-- Expected columns: relationship_type, total_edges, edges_with_source_paper_id,
-- edges_without_source_paper_id, provenance_coverage_pct

SELECT 
  e.relationship_type,
  COUNT(*) AS total_edges,
  COUNT(e.provenance->'meta'->>'source_paper_id') FILTER (WHERE e.provenance->'meta'->>'source_paper_id' IS NOT NULL) AS edges_with_source_paper_id,
  COUNT(*) FILTER (WHERE e.provenance->'meta'->>'source_paper_id' IS NULL) AS edges_without_source_paper_id,
  ROUND(
    100.0 * COUNT(e.provenance->'meta'->>'source_paper_id') FILTER (WHERE e.provenance->'meta'->>'source_paper_id' IS NOT NULL) / COUNT(*),
    2
  ) AS provenance_coverage_pct
FROM edges e
GROUP BY e.relationship_type
ORDER BY provenance_coverage_pct DESC, total_edges DESC;

-- ACTUAL OUTPUT (executed on database):
-- relationship_type | total_edges | edges_with_source_paper_id | edges_without_source_paper_id | provenance_coverage_pct
-- -----------------|-------------|----------------------------|------------------------------|------------------------
-- improves_on      | 53          | 47                         | 6                            | 88.68
-- extends          | 16          | 14                         | 2                            | 87.50
-- evaluates        | 83          | 72                         | 11                           | 86.75
-- uses             | 57          | 45                         | 12                           | 78.95
-- introduces       | 43          | 33                         | 10                           | 76.74
-- compares_to      | 15          | 8                          | 7                            | 53.33

-- ============================================================================
-- QUERY 14: Potential duplicate papers (by normalized title)
-- ============================================================================
-- Purpose: Identify papers that may be duplicates based on normalized title comparison.
--
-- Expected columns: normalized_title, paper_count, paper_ids, titles

SELECT 
  LOWER(REGEXP_REPLACE(title, '[^a-zA-Z0-9]', '', 'g')) AS normalized_title,
  COUNT(DISTINCT paper_id) AS paper_count,
  array_agg(DISTINCT paper_id ORDER BY paper_id) AS paper_ids,
  array_agg(DISTINCT title ORDER BY title) AS titles
FROM papers
WHERE title IS NOT NULL
GROUP BY LOWER(REGEXP_REPLACE(title, '[^a-zA-Z0-9]', '', 'g'))
HAVING COUNT(DISTINCT paper_id) > 1
ORDER BY paper_count DESC
LIMIT 10;

-- ACTUAL OUTPUT (executed on database):
-- normalized_title | paper_count | paper_ids | titles
-- -----------------|-------------|-----------|--------
-- 3dgaussiansplattingforrealtimeradiancefieldrendering | 3 | {2308_04079v1, 2308.04079, 2cc1d857e86d...} | {3D Gaussian Splatting for Real-Time Radiance Field Rendering}
-- 4dgaussiansplattingforrealtimedynamicscenerendering | 2 | {2310_08528v3, 395bfdae59f1a5fde16213cade43d2587e4565df} | {4D Gaussian Splatting for Real-Time Dynamic Scene Rendering}
-- deblurring3dgaussiansplatting | 2 | {2401_00834v3, 65902a95d5af409938b28b69808e916f8ef9e0bd} | {Deblurring 3D Gaussian Splatting}

-- ============================================================================
-- END OF QUERIES
-- ============================================================================

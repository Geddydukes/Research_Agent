-- Resolved edges view with canonical node resolution
-- Edges preserve original source/target, canonical versions added as separate columns
-- Initial version using correlated subquery (correct but slower at scale)
-- Rewrite to JOIN form when node count > 10,000

CREATE OR REPLACE VIEW edges_resolved AS
SELECT 
  e.*,
  COALESCE(
    (SELECT canonical_node_id FROM nodes_resolved WHERE id = e.source_node_id),
    e.source_node_id
  ) AS canonical_source_node_id,
  COALESCE(
    (SELECT canonical_node_id FROM nodes_resolved WHERE id = e.target_node_id),
    e.target_node_id
  ) AS canonical_target_node_id
FROM edges e;

-- Optimized version using JOIN (use when node count > 10,000)
-- Uncomment and replace above view when needed:
-- CREATE OR REPLACE VIEW edges_resolved AS
-- SELECT 
--   e.*,
--   COALESCE(src.canonical_node_id, e.source_node_id) AS canonical_source_node_id,
--   COALESCE(tgt.canonical_node_id, e.target_node_id) AS canonical_target_node_id
-- FROM edges e
-- LEFT JOIN nodes_resolved src ON src.id = e.source_node_id
-- LEFT JOIN nodes_resolved tgt ON tgt.id = e.target_node_id;

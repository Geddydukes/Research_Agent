-- Resolved nodes view with canonical node resolution
-- Only 'alias_of' links affect canonicalization (not 'same_as_candidate')
-- Initial version using correlated subquery (correct but slower at scale)
-- Rewrite to JOIN form when node count > 10,000

CREATE OR REPLACE VIEW nodes_resolved AS
SELECT 
  n.*,
  COALESCE(
    (SELECT canonical_node_id 
     FROM entity_links el 
     WHERE el.node_id = n.id 
       AND el.status = 'approved' 
       AND el.link_type = 'alias_of'  -- Only alias_of affects resolution
       AND el.tenant_id = n.tenant_id
     LIMIT 1),
    n.id
  ) AS canonical_node_id
FROM nodes n;

-- Optimized version using JOIN (use when node count > 10,000)
-- Uncomment and replace above view when needed:
-- CREATE OR REPLACE VIEW nodes_resolved AS
-- SELECT 
--   n.*,
--   COALESCE(el.canonical_node_id, n.id) AS canonical_node_id
-- FROM nodes n
-- LEFT JOIN LATERAL (
--   SELECT canonical_node_id
--   FROM entity_links
--   WHERE node_id = n.id
--     AND status = 'approved'
--     AND link_type = 'alias_of'
--     AND tenant_id = n.tenant_id
--   LIMIT 1
-- ) el ON true;

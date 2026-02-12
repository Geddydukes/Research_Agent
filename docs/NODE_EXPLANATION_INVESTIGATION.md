# Node explanation on entity (node) view – scope

**Goal:** Add a short, trackable explanation of what each node represents so the graph is easier to interpret.

## Current state

- **Entity detail panel** shows: name, type, confidence, connections count, papers list, relationships list.
- **Entity** has: `canonical_name`, `type`, `metadata`, confidence, review fields. No description/summary field.
- **Edges** have: `evidence` (quote from paper), `provenance`, relationship type.
- **DB:** `node_type_registry` has `type_name` and `description` (e.g. "A research method, algorithm, or technique" for "method"). Descriptions are seeded in migrations.

## Options (effort vs value)

### 1. Show entity type description (low effort)

- **What:** Display the registered description for the entity’s type (e.g. "Concept: A theoretical concept or idea") at the top of the node view.
- **Backend:** Expose type descriptions (e.g. GET `/api/node-types` or include `type_description` in graph/node payloads). Graph/nodes APIs currently do not join `node_type_registry`.
- **Frontend:** One line in the entity panel, e.g. under the title: `{typeDescription}`.
- **Effort:** Low. Add a small read API or extend graph/nodes response; no pipeline or schema change for `nodes`.

### 2. Use first edge evidence as context (low effort)

- **What:** Under the entity name, show a single line: "In context: [first available edge evidence, truncated]."
- **Data:** Already in the panel: edges for this node and `edge.evidence`. Pick first edge with non-empty `evidence`, truncate to ~100–120 chars.
- **Effort:** Low. Frontend-only; no API or DB change. Can combine with (1).

### 3. Stored node description (medium effort)

- **What:** Add a optional `description` or `summary` (TEXT) on `nodes`, filled by the pipeline, and show it in the node view.
- **Backend:** Migration adding column; pipeline step (e.g. from extraction or a dedicated summariser) that writes a one-sentence description when creating/updating the node; graph/nodes APIs already return node rows, so just include the new field.
- **Frontend:** Show `node.description` in the entity panel when present.
- **Effort:** Medium. One migration, one pipeline step, no new endpoint.

### 4. On-demand LLM explanation (higher effort)

- **What:** New endpoint, e.g. GET `/api/nodes/:id/explanation`, that returns a one-sentence explanation generated from node + edges/evidence.
- **Backend:** New route, service that loads node + edges (and optionally evidence), calls LLM, returns text; consider caching (e.g. by node id) to avoid repeated calls.
- **Frontend:** Call this when opening the entity panel; show loading state then the explanation.
- **Effort:** Higher. New endpoint, LLM usage, caching and error handling.

## Recommendation

- **Short term:** Implement **(1)** and **(2)**. Type description gives consistent meaning for the node’s type; one evidence snippet gives immediate context. Both are low effort and make the graph easier to follow.
- **Later:** If you want a single, curated sentence per node, add **(3)** and backfill from extraction or a small batch job; **(4)** is optional if you prefer on-demand generation and are okay with latency/cost.

## Summary table

| Option              | Effort  | New API / schema      | Pipeline change | Result in UI                    |
|---------------------|---------|------------------------|-----------------|---------------------------------|
| 1. Type description | Low     | Small read or extend  | No              | One line under title            |
| 2. First evidence   | Low     | No                    | No              | One "In context" line           |
| 3. Stored summary   | Medium  | Migration + field     | Yes             | One sentence when present        |
| 4. On-demand LLM    | Higher  | New endpoint + cache | No              | One sentence after short load   |

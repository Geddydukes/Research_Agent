# Future Roadmap

This roadmap outlines the path from the current Proof-of-Concept to a production-grade research assistant. All proposed features are grounded in the existing data structures and require no breaking changes to the core architecture.

## Phase 1: Scaling Ingestion (Months 1–3)

**Objective:** Move from processing 100-paper micro-corpora to continuous ingestion of entire domains (10k+ papers), prioritizing robustness and operational simplicity.

### Distributed Worker Architecture

**Current:**  
Monolithic script processing papers sequentially.

**Future:**  
Implement a persistent job queue (Redis/BullMQ).

**Action:**  
Decouple `runPipeline()` into a stateless worker function. Spin up worker nodes that consume job IDs from the queue. This allows horizontal scaling of expensive LLM calls without changing the core business logic.

### Reliability & Failure Recovery

**Problem:**  
At scale, worker nodes will inevitably crash or time out during processing.

**Solution:**  
Enforce idempotent job processing and at-least-once delivery.

**Implementation:**  
The pipeline status for each paper is tracked in the database (`processing`, `failed`, `complete`). If a worker crashes, the queue lease expires, and another worker retries the job. Crucially, specific stages (Ingestion, Extraction) check for existing artifacts before running, allowing the pipeline to “resume” rather than blindly restart.

### Incremental Embeddings & Caching via pgvector

**Current:**  
Re-embeds candidates on every run to compute similarity.

**Future:**  
Store embeddings permanently to speed up the Semantic Gating phase.

**Rationale:**  
We utilize pgvector (within the existing Postgres DB) rather than a separate vector store. This choice colocates semantic search with transactional graph data, simplifying consistency guarantees and reducing infrastructure sprawl.

---

## Phase 2: User Interface & Visualization (Months 3–6)

**Objective:** Shift interaction from SQL queries to an Entity-First Knowledge Graph, prioritizing the structural relationships between methods over citation counts.

### Entity-First Visualization Architecture

**Current:**  
No frontend; access via DB client.

**Future:**  
A “Force-Directed” visualization (React/D3.js) where Nodes are strictly Concepts, Methods, or Metrics—not papers.

**Visual Hierarchy:**

- **Primary Nodes:** Entities (colored by type: Blue = Methods, Green = Concepts)
- **Secondary Details:** Papers are treated as “provenance layers” or satellite nodes visible only in detail panels or specific “Paper” filter modes
- **Metrics Encoding:** Node size dynamically reflects degree centrality (visualizing the most influential concepts automatically)

### Explainable Interaction Layer

**Edge Inspection Modals:**  
Clicking an edge (e.g., `IMPROVES`) opens a modal identifying the source paper, the exact evidence quote, and the validation confidence score. This prevents the graph from looking like a “black box.”

**Role-Based Access:**  
Distinguish between Observer (read-only exploration) and Curator (ability to verify flagged edges or manage insights) to protect the integrity of the public graph.

**Insight Integration:**  
The detail panel for any node surfaces related records from the `inferred_insights` table (e.g., “Central to ‘Novel View Synthesis’ cluster”), bridging the gap between raw data and reasoning.

---

## Phase 3: Advanced Intelligence (Months 6+)

**Objective:** Deepen the semantic capabilities of the graph using human-in-the-loop workflows to ensure data integrity.

### Semantic Entity Resolution Service

**Problem:**  
“NeRF” and “Neural Radiance Fields” exist as separate nodes.

**Solution:**  
A background job identifies clusters of semantically identical nodes using embedding similarity and flags them for review.

**Guardrails:**  

- Merges are not destructive. They are implemented as reversible “redirects” or “alias links.”
- Original node IDs are preserved to maintain historical edge provenance.
- If a human reviewer approves a bad merge, it can be seamlessly undone without data loss.

### Trend Analysis & Gap Detection

**Concept:**  
Programmatic analysis of graph structure to surface research opportunities.

**Queries:**

- **Hotspots:** Concepts with a velocity of new `uses` edges exceeding 2 standard deviations (  
  ) of the baseline.
- **Coldspots:** Methods that are highly cited but have zero `improves_on` edges (indicating saturation or plateau).
- **Anomalies:** Papers claiming “State-of-the-Art” in abstract but lacking `evaluates → Dataset` edges in the graph structure.

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

**Objective:** Formalize and extend the internal visualization used for debugging and data model validation into a researcher-facing interface for exploring the entity-first knowledge graph, while preserving the system’s explainability and trust guarantees.

### Entity-First Visualization Architecture

**Current:**  
A lightweight, read-only graph visualization exists as internal tooling (React + force-directed layout). It supports filtering, search, and inspection of extracted nodes and edges, and was used to validate that entities, relationship semantics, confidence scores, and provenance are navigable without additional transformation.

**Future:**  
Harden this tooling into a production-ready UI centered on **entities as the primary graph objects**:

- **Primary Nodes:** Concepts, Methods, Datasets, Metrics (visually distinguished by type).
- **Papers as Provenance:** Papers are surfaced contextually to explain *why* an edge exists (evidence excerpt, section type, confidence), and may optionally be rendered as “context nodes” in a dedicated mode for tracing attribution without letting paper nodes dominate the main graph.
- **Structural Encoding:** Node emphasis encodes graph-derived signals (e.g., degree centrality or influence), surfacing important methods and concepts without relying on citation counts.

### Explainable Interaction Layer

- **Detail Panel:** Selecting any node reveals its relationships (direction, type, confidence) and associated provenance (source paper, section type, evidence excerpt).
- **Edge Inspection:** Selecting an edge opens an inspection view showing the exact evidence supporting the relationship plus validation metadata, preventing the graph from behaving like a black box.
- **Insight Integration:** Node detail surfaces related records from `inferred_insights` (e.g., cluster membership or transitive relationships) to bridge raw structure and reasoning outputs.

### Exploration Controls

- Entity-type and relationship-type filters
- Unconnected-node toggle to reduce visual noise under filtering
- Search with match highlighting
- Pan/zoom and optional clustering by entity type for macro-level navigation

> **Exploratory Visualization (Internal Tooling):**  
> A hosted, read-only visualization used during development to validate the data model and agent outputs is available at:  
> https://research-agent-eta.vercel.app  
>  
> This interface is intentionally minimal and was used for debugging, inspection, and schema validation. It is not intended to represent a finished or production UI, but rather to demonstrate that the entity-first graph and provenance model are navigable and interpretable without additional transformation.


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

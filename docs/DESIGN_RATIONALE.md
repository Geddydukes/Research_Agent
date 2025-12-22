# Design Rationale

This document explains the engineering decisions behind the AI Research Discovery Agent, mapping architectural choices to the constraints, failure modes, and long-term requirements of large-scale research analysis.  
These decisions directly address the four key design considerations outlined in the challenge: graph representation, extraction reliability, user-facing explainability, and scalability.

## 1. Controlling Information Overload and Compute Cost

### Challenge

Modern research domains (e.g., Computer Vision) produce thousands of papers per month. Naively ingesting all papers via LLM-based extraction is cost-prohibitive and results in a low-signal knowledge graph dominated by irrelevant or marginally related work.

### Design Decision: Semantic Gating as an Authoritative Control Point

We introduced a mandatory semantic similarity gating phase positioned before any LLM-based ingestion (`src/ingest/unified/selection.ts`).

### Mechanism

- Embed the seed paper’s title and abstract.
- Embed all candidate paper titles and abstracts.
- Compute cosine similarity.
- Enforce a hard similarity threshold (default  
  0.7).
- Select only the top-K candidates under strict caps.

### Rationale

Keyword search alone yields high recall but poor precision. Semantic similarity provides a signal that allows us to spend expensive extraction compute (4-5 LLM calls per paper) only on papers that are meaningfully related to the seed topic. Semantic gating is intentionally non-LLM and deterministic, ensuring reproducible corpus selection and preventing relevance drift across runs.

### Outcome

- Predictable cost via `maxSelectedPapers` (default 100).
- High signal-to-noise ratio in the resulting graph.
- Discovery quality is guaranteed even if retrieval sources return noisy data.

## 2. Mitigating LLM Hallucination and Nondeterminism

### Challenge

LLMs are effective at extracting structure from text but are unreliable as authorities. They hallucinate entities, invent relationships, and frequently produce malformed output under token pressure.

### Principle A: Probabilistic Generation, Deterministic Enforcement

**Design Decision:** All LLM outputs are treated as untrusted input.

**Implementation:** Extraction agents feed into a deterministic validation layer implemented in TypeScript (`src/agents/validationRules.ts`), not prompts. Validation enforces hard invariants: minimum confidence thresholds, no self-referential edges, and duplicate suppression.

**Rationale:** Using LLMs to validate other LLMs compounds nondeterminism. Code-based rules establish a hard reliability floor and make system behavior reproducible. We explicitly avoided end-to-end LLM reasoning over raw PDFs, as this approach collapses extraction, validation, and reasoning into a single nondeterministic step that is difficult to debug or scale.

**Outcome:** The system favors precision over recall, accepting occasional omissions to avoid corrupting the graph with false positives.

### Principle B: Progressive Degradation over Hard Failure

**Design Decision:** Extraction agents retry with progressively constrained prompts under failure.

**Implementation:** If the Relationship Extraction agent fails (e.g., due to truncation), it retries in:

- **Normal Mode:** Full evidence and metadata.
- **Compact Mode:** Evidence strings omitted.
- **Minimal Mode:** Max 8 edges only, prioritizing highest confidence.

**Rationale:** Dense or long papers can exceed context limits. A partial but correct graph is preferable to a crashed pipeline.

## 3. Ensuring Explainability and Auditability

### Challenge

Vector similarity and citation graphs indicate relatedness but fail to explain why papers are connected.

### Design Decision: Evidence-First Schema

**Implementation:** Every relationship edge requires a verbatim evidence quote (max 300 characters) and provenance metadata (Section ID, Part Index).

**Rationale:** In research contexts, trust depends on inspectability. A relationship without context cannot be evaluated by a human.

**Outcome:** Every edge in the graph can be traced to a specific sentence in a specific paper section, enabling auditability and future UI affordances such as clickable explanations.

## 4. Handling Unreliable External APIs

### Challenge

External sources such as Semantic Scholar and arXiv exhibit rate limits (429s), downtime (5xx), and inconsistent availability.

### Design Decision: Non-Blocking, Multi-Source Retrieval

**Implementation:** Retrieval is performed across multiple sources using `Promise.allSettled` with exponential backoff and jitter.

**Rationale:** Retrieval is treated as high-recall and low-trust. Failures in any single source (e.g., Semantic Scholar) should not prevent discovery if another (arXiv) is available.

**Outcome:** The system degrades gracefully, continuing to function even when individual providers fail.

## 5. Graph Representation and Schema Rigidity

### Challenge

Allowing agents to dynamically invent node or edge types leads to schema drift and unusable graphs.

### Design Decision: Fixed Ontology

**Implementation:** The graph uses a fixed set of node types (Method, Concept, Dataset, Metric) and edge types (improves_on, uses, etc.), enforced at validation time.

**Rationale:** Schema rigidity enables deterministic validation, efficient SQL querying, and stable reasoning rules. While the ontology is fixed in this implementation, it is designed to be extended deliberately rather than emergently, preserving graph integrity as new domains are added.

**Outcome:** Canonicalization ensures that identical concepts map to a single node, preventing combinatorial graph growth and fragmentation. The system now extends this with semantic entity resolution (two-tier: exact match + embedding similarity) to link semantically identical entities while preserving reversibility through link-based canonicalization.

## 6. Scalability and Incremental Growth

### Challenge

Full-graph processing does not scale as the corpus grows from 100 to 10,000 papers.

### Design Decision: Bounded Execution & Incrementalism

**Implementation:**

- Lane-based concurrency: Distinct rate limits for Embeddings (4 concurrent) vs. LLMs (2 concurrent) to prevent API saturation.
- Multi-level caching: Caching of agent outputs, derived artifacts, and embeddings.
- Incremental reasoning: Reasoning runs only over induced subgraphs (depth=2) of newly ingested papers.
- **Persistent embeddings**: Paper and entity embeddings stored in PostgreSQL using pgvector, enabling fast similarity search without redundant API calls.

**Rationale:** This prevents retry storms, reduces tail latency, and ensures that computation scales with the rate of change, not total corpus size. Storing embeddings in the database (rather than recomputing) dramatically reduces semantic gating latency for papers already processed.

**Outcome:** The system can grow incrementally without sacrificing responsiveness or correctness.

## 7. Semantic Entity Resolution

### Challenge

Exact string matching fails to link semantically identical entities (e.g., "3D Gaussian Splatting" vs "3DGS" vs "3d_gaussian_splatting").

### Design Decision: Two-Tier Resolution with Link-Based Canonicalization

**Implementation:**

- **Tier A (Deterministic)**: Exact canonical name matching
- **Tier B (Semantic)**: Embedding-based similarity search with strict auto-approval rules
- **Link-based approach**: Entities are linked (not merged) via `entity_links` table with `alias_of` relationships
- **Query-time resolution**: `nodes_resolved` and `edges_resolved` views preserve original node IDs while providing canonical resolution
- **Dual embeddings**: Entities store both 3072-dim raw embeddings (precision) and 768-dim indexed embeddings (fast HNSW search)

**Rationale:** False merges are irreversible and destroy information. The link-based approach allows all canonicalization decisions to be audited and reversed. Strict auto-approval thresholds (similarity ≥ 0.95, shared alias/phrase, no short acronyms) prevent false positives while still enabling high-confidence automatic linking.

**Outcome:** The graph maintains precision while reducing fragmentation through semantic resolution, with all decisions being reversible and auditable.

Together, these decisions prioritize semantic precision, operational reliability, and explainability, forming a foundation suitable for both exploratory research and production-scale discovery.

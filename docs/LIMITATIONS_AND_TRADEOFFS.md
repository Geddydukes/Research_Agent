# Limitations and Trade-offs

This document outlines the intentional boundaries of the current system, distinguishing between deliberate design trade-offs and temporary Proof-of-Concept (PoC) constraints. These limitations are chosen to preserve correctness, explainability, and operational reliability under real-world conditions.

## 1. Functional Limitations (Intentional Design Choices)

These are features deliberately excluded to maintain the system’s strict focus on precision, auditability, and deterministic behavior.

### A. No Speculative Cross-Paper Inference

**Limitation:**  
The system only creates an edge if Paper A explicitly mentions Paper B or Entity C. It does not infer connections based on shared topics or latent similarity (e.g., "Paper A and Paper B both discuss 'pruning', so they must be related").

**Trade-off:**  
We sacrifice recall (missing implicit connections) in favor of precision.

**Why:**  
Speculative edges introduce noise and erode trust. Every relationship in the graph must be traceable to explicit textual evidence to remain auditable. This constraint is architectural rather than fundamental and could be relaxed in the future by introducing confidence-weighted, explicitly labeled speculative edges.

---

### B. Fixed Relationship Vocabulary

**Limitation:**  
The system is restricted to a fixed set of six relationship types (`introduces`, `uses`, `evaluates`, `improves_on`, `extends`, `compares_to`). It does not dynamically learn new relationship types.

**Trade-off:**  
We lose expressive nuance but gain computability.

**Why:**  
A fixed vocabulary enables deterministic reasoning rules (e.g., interpreting chains of `improves_on` as progress). Allowing dynamic relationship types would require fragile, heuristic interpretation logic and weaken reasoning guarantees.

---

### C. Semantic Entity Resolution (Implemented)

**Current State:**  
Entity deduplication uses a two-tier resolution system:
1. **Tier A (Deterministic):** Exact matching of canonicalized names
2. **Tier B (Semantic):** Embedding-based similarity matching with strict auto-approval rules

**Implementation:**  
- Entities are linked (not merged) through `entity_links` table with `alias_of` relationships
- Only high-confidence matches (similarity ≥ 0.95, shared alias/phrase, no short acronyms) are auto-approved
- All other matches are proposed for manual review
- Query-time resolution via `nodes_resolved` and `edges_resolved` views preserves original node IDs

**Trade-off:**  
Strict auto-approval thresholds may leave some semantic variants as separate nodes until manually reviewed, but this prevents false merges that would corrupt the graph.

**Why:**  
False merges are irreversible and destroy information. The link-based approach (rather than destructive merges) allows all canonicalization decisions to be audited and reversed.

---

## 2. Technical Limitations (PoC Constraints)

These limitations reflect the current maturity of the implementation and can be addressed with additional engineering effort as the system scales.

### A. Bounded, Low-Concurrency Ingestion

**Limitation:**  
Paper ingestion operates with conservative concurrency limits via lane-based rate limiters.

**Impact:**  
Throughput is typically limited to roughly 1–2 papers per minute under current concurrency constraints.

**Acceptability:**  
For a PoC targeting focused corpora (~100 papers), this simplifies failure isolation and database contention without introducing complex distributed queue infrastructure.

---

### B. In-Memory Subgraph Construction

**Limitation:**  
The reasoning agent loads the induced subgraph (default depth = 2) entirely into memory before processing.

**Impact:**  
Highly connected central nodes could potentially stress memory or token context limits.

**Acceptability:**  
Strict corpus caps (`MAX_SELECTED_PAPERS`) and relationship validation prevent the graph from growing large enough to break this constraint in the current version. This limitation directly motivates the system’s incremental reasoning design (processing only subgraphs rather than the full graph).

---

### C. Limited Reasoning Depth

**Limitation:**  
Reasoning traversal is bounded to 2 hops.

**Impact:**  
Long chains of influence (e.g., Paper A → Paper B → Paper C → Paper D) are not detected in a single pass.

**Acceptability:**  
Deeper traversal exponentially increases cost and hallucination risk. Depth-2 captures the majority of immediate, verifiable insights (such as transitive improvements) required for the core use case.

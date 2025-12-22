# AI Research Discovery Agent

This project addresses a core problem in modern research workflows: academic papers encode rich semantic claims, but those claims are not structured in a way that supports reliable discovery, comparison, or reasoning.

In fast-moving domains such as computer vision, researchers face three fundamental challenges:

- **Information Overload**  
  Thousands of papers are published monthly, far beyond what any individual can read.

- **Implicit Structure**  
  Relationships such as *introduces*, *improves on*, or *evaluates* are expressed in prose, not as queriable data.

- **Low-Trust Automation**  
  Naive “Chat with PDF” or vector-search approaches surface results quickly but provide no guarantees about correctness, provenance, or global consistency.

A system that merely retrieves or summarizes papers is insufficient. To support real research discovery, the output must be **structured, auditable, and trustworthy at scale**.

---

## Design Thesis

This system is built around a simple principle:

**Use LLMs for probabilistic extraction, but never for authority.**

Large Language Models are well suited to reading messy, unstructured text and proposing candidate entities and relationships. However, they are non-deterministic, susceptible to hallucination, and unreliable at enforcing global constraints such as graph topology.

To address this, the architecture deliberately separates concerns:

- **Probabilistic Extraction**  
  Stateless LLM agents (Gemini 1.5 Pro / Flash) identify candidate entities and semantic relationships from paper text.

- **Deterministic Validation**  
  All extracted data is treated as untrusted input. Strict, code-based validation logic enforces canonicalization, confidence thresholds, structural invariants, and provenance before any mutation of the graph.

This separation allows the system to scale ingestion while preserving correctness, explainability, and long-term maintainability.

---

## What the System Does

At a high level, the system operates as a bounded pipeline:

- **Semantic Gating**  
  Candidate papers are embedded and strictly gated based on cosine similarity to a seed paper, ensuring compute is only spent on relevant literature.

- **Structured Extraction**  
  Specialized agents extract entities (Methods, Concepts, Datasets, Metrics) and relationships using a fixed, strictly typed vocabulary (e.g., `improves_on`, `extends`).

- **Safety & Persistence**  
  Deterministic rules reject low-confidence edges, penalize orphan entities, and catch self-references before persisting validated data to a Postgres graph schema.

- **Incremental Reasoning**  
  An optional reasoning agent identifies multi-hop insights over bounded subgraphs, ensuring explainability without unbounded cost growth.

---

## Corpus Selection

Papers are selected using a two-phase strategy:
1. **Multi-source retrieval:** Gather ~500-1000 candidates from Semantic Scholar (citations, references, keywords) and arXiv (title, author, category searches)
2. **Semantic gating:** Embed all candidates, compute cosine similarity to the seed paper, filter to similarity ≥ 0.7, select top 100

This ensures only semantically relevant papers consume expensive LLM extraction resources, reducing costs by ~80% compared to processing all citations.

**Seed paper:** "3D Gaussian Splatting for Real-Time Radiance Field Rendering" (Kerbl et al., 2023)

## Results

Processed 46 papers from the Gaussian Splatting domain, extracting:
- **228 entities** (102 Methods, 38 Concepts, 28 Datasets, 21 Metrics)
- **267 relationships** (improves_on, uses, evaluates, introduces, extends, compares_to)
- **60 inferred insights** via multi-hop reasoning

Validation: 98% entity approval rate, 76% edge approval rate (low-confidence edges rejected by design).

---

## Documentation Guide

This README provides a high-level orientation. Detailed architecture, validation logic, trade-offs, and diagrams are documented separately to keep this overview clean:

- **[SYSTEM_ARCHITECTURE_OVERVIEW.md](docs/SYSTEM_ARCHITECTURE_OVERVIEW.md)** 
- **[LIMITATIONS_AND_TRADEOFFS.md](docs/LIMITATIONS_AND_TRADEOFFS.md)**   
- **[DESIGN_RATIONALE.md](docs/DESIGN_RATIONALE.md)** 
- **[FUTURE_ROADMAP.md](docs/FUTURE_ROADMAP.md)** 

---

> **Note on Visualization**  
> A lightweight, read-only graph visualization was built as an internal debugging and data model validation aid. Its purpose was to sanity-check extracted entities, relationships, confidence signals, and provenance during development—not to serve as a production UI. This helped validate that the entity-first data model and deterministic validation rules produce a graph that is navigable and interpretable without additional transformation.

---

## Example SQL Queries

The submission includes a set of **runnable Postgres queries** demonstrating common research-discovery workflows, including the take-home prompt example:

> *Which papers improve on the original 3D Gaussian Splatting method?*

See: **[`sql/queries.sql`](sql/queries.sql)** for complete, executable examples grounded in the implemented schema.

-- ============================================================================
-- QUERY 1: Papers that improve on 3D Gaussian Splatting
-- ============================================================================
-- Purpose: Find all papers that claim to improve on the 3D Gaussian Splatting
-- method, ordered by confidence and year.
-- 
-- Note: This query finds relationships where '3d_gaussian_splatting' is the TARGET
-- (i.e., other methods/papers improve on it). Uses edge provenance to link to
-- source papers deterministically, avoiding entity_mentions join ambiguity.
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

---

## Tech Stack

- **Runtime:** Node.js / TypeScript  
- **Database:** PostgreSQL 
- **LLMs:** Google Gemini 2.5 Pro & Flash 
- **Validation:** Zod schemas & custom TypeScript logic  
- **Embeddings:** `gemini-embedding-001`  

---

## Why This Matters

In security-critical domains, automation fails when systems cannot be trusted, inspected, or audited.

While LLM-based tools can generate plausible summaries or answers, they do not produce artifacts that are suitable as sources of truth. In environments where decisions must be defensible, reproducible, and resilient to scale, probabilistic outputs alone are insufficient.

This project treats LLMs as probabilistic readers, not authorities. By enforcing structure, validation, and provenance in deterministic code, it produces a knowledge graph where every relationship is accountable to explicit evidence in the source material. The result is a system of record that supports inspection, audit, and long-term reasoning—properties that are essential not just for research discovery, but for building trustworthy AI systems in adversarial and high-stakes settings.

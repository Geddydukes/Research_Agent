# AI Research Discovery Agent

This repository contains my submission for the **AI Engineer take-home assignment**, focused on building an agentic system for research discovery.

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

## Documentation Guide

This README provides a high-level orientation. Detailed architecture, validation logic, trade-offs, and diagrams are documented separately to keep this overview clean:

- **[SYSTEM_ARCHITECTURE_OVERVIEW.md](docs/SYSTEM_ARCHITECTURE_OVERVIEW.md)** 
- **[LIMITATIONS_AND_TRADEOFFS.md](docs/LIMITATIONS_AND_TRADEOFFS.MD)**   
- **[DESIGN_RATIONALE.md](docs/DESIGN_RATIONALE.md)** 
- **[FUTURE_ROADMAP.md](docs/FUTURE_ROADMAP.MD)** 

---

> **Note on Visualization**  
> A lightweight, read-only graph visualization was built as an internal debugging and data model validation aid. Its purpose was to sanity-check extracted entities, relationships, confidence signals, and provenance during development—not to serve as a production UI. This helped validate that the entity-first data model and deterministic validation rules produce a graph that is navigable and interpretable without additional transformation.

---

## Example SQL Queries

The submission includes a set of **runnable Postgres queries** demonstrating common research-discovery workflows, including the take-home prompt example:

> *Which papers improve on the original 3D Gaussian Splatting method?*

See: **[`sql/queries.sql`](sql/queries.sql)** for complete, executable examples grounded in the implemented schema.

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

CREATE TABLE IF NOT EXISTS nodes (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  metadata JSONB,
  original_confidence FLOAT,
  adjusted_confidence FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edges (
  id SERIAL PRIMARY KEY,
  source_node_id INT REFERENCES nodes(id) ON DELETE CASCADE,
  target_node_id INT REFERENCES nodes(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  confidence FLOAT NOT NULL,
  evidence TEXT,
  provenance JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS papers (
  paper_id TEXT PRIMARY KEY,
  title TEXT,
  abstract TEXT,
  year INT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paper_sections (
  id SERIAL PRIMARY KEY,
  paper_id TEXT REFERENCES papers(paper_id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INT,
  part_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entity_mentions (
  id SERIAL PRIMARY KEY,
  node_id INT REFERENCES nodes(id) ON DELETE CASCADE,
  paper_id TEXT REFERENCES papers(paper_id) ON DELETE CASCADE,
  section_type TEXT,
  mention_count INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inferred_insights (
  id SERIAL PRIMARY KEY,
  insight_type TEXT NOT NULL,
  subject_nodes INT[] NOT NULL,
  reasoning_path JSONB,
  confidence FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS node_type_registry (
  type_name TEXT PRIMARY KEY,
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_node ON entity_mentions(node_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_paper ON entity_mentions(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_sections_paper ON paper_sections(paper_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_canonical_name ON nodes(canonical_name);


// Entity types matching your backend
export interface Entity {
  id: number;
  type: EntityType;
  canonical_name: string;
  metadata: Record<string, unknown> | null;
  original_confidence: number | null;
  adjusted_confidence: number | null;
  created_at: string;
}

export type EntityType = 'method' | 'dataset' | 'metric' | 'concept' | 'task' | 'model' | string;

// Edge types matching your backend
export interface Edge {
  id: number;
  source_node_id: number;
  target_node_id: number;
  relationship_type: RelationshipType;
  confidence: number;
  evidence: string | null;
  provenance: EdgeProvenance | null;
  created_at: string;
}

export type RelationshipType = 
  | 'extends'
  | 'improves'
  | 'uses'
  | 'evaluates'
  | 'compares_to'
  | 'implements'
  | 'based_on'
  | string;

export interface EdgeProvenance {
  section_type?: string;
  part_index?: number;
  paper_id?: string;
  meta?: {
    source_paper_id?: string;
    target_paper_id?: string;
  };
}

// Paper types
export interface Paper {
  paper_id: string;
  title: string | null;
  abstract: string | null;
  year: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Entity mention
export interface EntityMention {
  id: number;
  node_id: number;
  paper_id: string;
  section_type: string | null;
  mention_count: number;
  created_at: string;
}

// Inferred insight
export interface InferredInsight {
  id: number;
  insight_type: InsightType;
  subject_nodes: number[];
  reasoning_path: ReasoningPath | null;
  confidence: number;
  created_at: string;
}

export type InsightType = 
  | 'transitive_relationship'
  | 'cluster_analysis'
  | 'anomaly_detection'
  | 'gap_identification'
  | 'trend_analysis';

export interface ReasoningPath {
  steps: string[];
  confidence: number;
}

// Graph data from API
export interface GraphData {
  nodes: Entity[];
  edges: Edge[];
}

// Edge modal data
export interface EdgeModalData {
  edge: Edge;
  source_node: Entity | null;
  target_node: Entity | null;
  source_paper: Paper | null;
  target_paper: Paper | null;
}

// For react-force-graph
export interface GraphNode {
  id: string;
  entity: Entity;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  edge: Edge;
}

export interface ForceGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Entity types matching your backend
export interface Entity {
  id: number;
  type: EntityType;
  canonical_name: string;
  metadata: Record<string, unknown> | null;
  original_confidence: number | null;
  adjusted_confidence: number | null;
  review_status?: 'approved' | 'flagged' | 'rejected' | null;
  review_reasons?: string | null;
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
  review_status?: 'approved' | 'flagged' | 'rejected' | null;
  review_reasons?: string | null;
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
  vx?: number;  // D3 velocity x
  vy?: number;  // D3 velocity y
}

export interface GraphLink {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  edge: Edge;
}

export interface PipelineJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  paperId?: string;
  result?: PipelineJobResult;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PipelineJobProgress {
  stage?: string;
  updated_at?: string;
}

export interface PipelineJobStats {
  sectionsExtracted?: number;
  entitiesExtracted?: number;
  edgesExtracted?: number;
  entitiesApproved?: number;
  entitiesFlagged?: number;
  entitiesRejected?: number;
  edgesApproved?: number;
  edgesFlagged?: number;
  edgesRejected?: number;
  insightsGenerated?: number;
  processingTimeMs?: number;
  reasoningSkipped?: boolean;
}

export interface PipelineJobResult {
  success?: boolean;
  paper_id?: string;
  progress?: PipelineJobProgress;
  stats?: PipelineJobStats;
  error?: string;
  [key: string]: unknown;
}

export interface ArxivPaper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  externalIds?: Record<string, string>;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface TenantMembership {
  tenant: TenantSummary;
  role: 'owner' | 'member' | 'viewer';
}

export interface ForceGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

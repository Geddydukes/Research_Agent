import type { Node, Edge, Paper } from '../../db/client';

// Request/Response types for API endpoints

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface GraphNeighborhoodParams {
  nodeId?: number;
  paperId?: string;
  depth?: number;
  maxNodes?: number;
  maxEdges?: number;
}

export interface GraphViewportParams {
  paperId?: string;
  depth?: number;
  maxNodes?: number;
}

export interface GraphSubgraphParams {
  paperIds: string[];
}

export interface SearchParams {
  q: string;
  type?: 'paper' | 'node';
  limit?: number;
}

// Edge modal response - first class contract
export interface EdgeModalResponse {
  edge: Edge;
  source_node: Node | null;
  target_node: Node | null;
  source_paper: Paper | null;
  target_paper: Paper | null;
  validation_status?: 'approved' | 'flagged' | 'rejected';
  validation_reason?: string;
  inferred_insight_ids: number[];
}

// Graph response for UI
export interface GraphResponse {
  nodes: Node[];
  edges: Edge[];
  metadata: {
    nodeCount: number;
    edgeCount: number;
    depth: number;
  };
}

// Pipeline job status
export interface PipelineJobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  paperId?: string;
  progress?: {
    stage: string;
    completed: boolean;
  };
  result?: {
    success: boolean;
    stats?: Record<string, unknown>;
    error?: string;
  };
}

// Stats response
export interface StatsResponse {
  papers: {
    total: number;
    processed: number;
  };
  nodes: {
    total: number;
    byType: Record<string, number>;
  };
  edges: {
    total: number;
    byType: Record<string, number>;
  };
  insights: {
    total: number;
  };
}

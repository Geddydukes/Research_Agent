export interface PaperInput {
  paper_id: string;
  title?: string;
  raw_text: string;
  metadata?: Record<string, unknown>;
}

export interface PipelineResult {
  success: boolean;
  paper_id: string;
  stats?: {
    sectionsExtracted: number;
    entitiesExtracted: number;
    edgesExtracted: number;
    entitiesApproved: number;
    entitiesFlagged: number;
    entitiesRejected: number;
    edgesApproved: number;
    edgesFlagged: number;
    edgesRejected: number;
    insightsGenerated: number;
    processingTimeMs: number;
    reasoningSkipped?: boolean;
  };
  error?: string;
}


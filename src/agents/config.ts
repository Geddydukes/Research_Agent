export const AGENT_MODELS = {
  ingestion: process.env.INGESTION_MODEL || 'gemini-2.5-flash',
  entityExtraction: process.env.ENTITY_EXTRACTION_MODEL || 'gemini-2.5-flash',
  relationshipExtraction: process.env.RELATIONSHIP_EXTRACTION_MODEL || 'gemini-2.5-flash',
  validation: process.env.VALIDATION_MODEL || 'gemini-2.5-pro',
  reasoning: process.env.REASONING_MODEL || 'gemini-2.5-pro',
} as const;

export const AGENT_CONFIG = {
  maxRetries: 2,
  timeoutMs: 60000,
  maxTokens: 16000,
  pdfParseConfidenceThreshold: parseFloat(process.env.PDF_PARSE_CONFIDENCE_THRESHOLD || '0.8'),
} as const;

export const REASONING_CONFIG = {
  maxRetries: 2,
  timeoutMs: 120000,
  maxTokens: 16000,
  pdfParseConfidenceThreshold: parseFloat(process.env.PDF_PARSE_CONFIDENCE_THRESHOLD || '0.8'),
} as const;

export const CONFIDENCE_THRESHOLDS = {
  reject: { min: 0.0, max: 0.3 },
  review: { min: 0.3, max: 0.6 },
  accept: { min: 0.6, max: 1.0 },
} as const;

export const PDF_PARSE_CONFIDENCE_THRESHOLD = 
  parseFloat(process.env.PDF_PARSE_CONFIDENCE_THRESHOLD || '0.8');

export type AgentConfig = {
  maxRetries: number;
  timeoutMs: number;
  maxTokens: number;
  pdfParseConfidenceThreshold: number;
};


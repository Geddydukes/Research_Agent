import { runAgent } from '../agents/runAgent';
import { AGENT_CONFIG, REASONING_CONFIG } from '../agents/config';
import {
  IngestionSchema,
  EntitySchema,
  EdgeSchema,
  ValidationSchema,
  InsightSchema,
  type IngestionOutput,
  type EntityOutput,
  type EdgeOutput,
  type ValidationOutput,
  type InsightOutput,
} from '../agents/schemas';
import {
  INGESTION_PROMPT,
  ENTITY_EXTRACTION_PROMPT,
  RELATIONSHIP_EXTRACTION_PROMPT,
  VALIDATION_PROMPT,
  REASONING_PROMPT,
} from '../agents/prompts';
import { createDatabaseClient, DatabaseClient } from '../db/client';
import {
  TimeoutError,
  SchemaValidationError,
  AgentExecutionError,
} from '../agents/errors';
import type { PaperInput, PipelineResult } from './types';

interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
}

const defaultLogger: Logger = {
  error: (msg, ctx) => console.error(`[Pipeline] ${msg}`, ctx || ''),
  warn: (msg, ctx) => console.warn(`[Pipeline] ${msg}`, ctx || ''),
  info: (msg, ctx) => console.info(`[Pipeline] ${msg}`, ctx || ''),
};

function formatSectionsForDb(
  paperId: string,
  sections: IngestionOutput['sections']
) {
  return sections.map((section) => ({
    paper_id: paperId,
    section_type: section.section_type,
    content: section.content,
    word_count: section.word_count,
    part_index: section.part_index ?? 0,
  }));
}

async function insertEntitiesWithDedup(
  db: DatabaseClient,
  validatedEntities: ValidationOutput['validated_entities'],
  paperId: string,
  logger: Logger = defaultLogger
): Promise<Map<string, number>> {
  const entityMap = new Map<string, number>();

  for (const entity of validatedEntities) {
    if (entity.decision === 'rejected') {
      continue;
    }
    
    if (entity.decision === 'flagged') {
      logger.info(`[Pipeline] Entity flagged for review: ${entity.canonical_name} (${entity.reason || 'no reason provided'})`);
    }

    let node = await db.findNodeByCanonicalName(
      entity.canonical_name,
      entity.type
    );

    if (!node) {
      node = await db.insertNode({
        type: entity.type,
        canonical_name: entity.canonical_name,
        original_confidence: entity.original_confidence,
        adjusted_confidence: entity.adjusted_confidence,
      });
    }

    entityMap.set(entity.canonical_name, node.id);

    await db.insertEntityMentions([
      {
        node_id: node.id,
        paper_id: paperId,
        mention_count: 1,
      },
    ]);
  }

  return entityMap;
}

async function insertEdges(
  db: DatabaseClient,
  validatedEdges: ValidationOutput['validated_edges'],
  originalEdges: EdgeOutput['edges'],
  entityMap: Map<string, number>,
  logger: Logger = defaultLogger
): Promise<void> {
  const edgesToInsert = [];

  const originalEdgeMap = new Map<string, EdgeOutput['edges'][0]>();
  for (const origEdge of originalEdges) {
    const key = `${origEdge.source_canonical_name}::${origEdge.target_canonical_name}::${origEdge.relationship_type}`;
    originalEdgeMap.set(key, origEdge);
  }

  for (const validatedEdge of validatedEdges) {
    if (validatedEdge.decision === 'rejected') {
      continue;
    }

    const sourceId = entityMap.get(validatedEdge.source_canonical_name);
    const targetId = entityMap.get(validatedEdge.target_canonical_name);

    if (!sourceId || !targetId) {
      logger.warn('Edge references unknown entity', {
        source: validatedEdge.source_canonical_name,
        target: validatedEdge.target_canonical_name,
        decision: validatedEdge.decision,
        reason: validatedEdge.reason,
        entityMapKeys: Array.from(entityMap.keys()).slice(0, 10),
      });
      continue;
    }

    const key = `${validatedEdge.source_canonical_name}::${validatedEdge.target_canonical_name}::${validatedEdge.relationship_type}`;
    const originalEdge = originalEdgeMap.get(key);

    edgesToInsert.push({
      source_node_id: sourceId,
      target_node_id: targetId,
      relationship_type: validatedEdge.relationship_type,
      confidence: validatedEdge.confidence,
      evidence: originalEdge?.evidence,
      provenance: originalEdge?.provenance,
    });
  }

  if (edgesToInsert.length > 0) {
    await db.insertEdges(edgesToInsert);
  }
}

async function insertInsights(
  db: DatabaseClient,
  insights: InsightOutput['insights'],
  graphNodes: Array<{ id: number; canonical_name: string; type: string }>
): Promise<void> {
  const nodeNameMap = new Map<string, number>();
  const nodeIdMap = new Map<string, number>();
  
  for (const node of graphNodes) {
    const key = `${node.canonical_name}::${node.type}`;
    if (!nodeNameMap.has(key)) {
      nodeNameMap.set(key, node.id);
    }
    if (!nodeNameMap.has(node.canonical_name)) {
      nodeNameMap.set(node.canonical_name, node.id);
    }
    nodeIdMap.set(node.id.toString(), node.id);
  }

  const insightsToInsert = [];

  for (const insight of insights) {
    const nodeIds = insight.subject_nodes
      .map((ref) => {
        const byId = nodeIdMap.get(ref);
        if (byId !== undefined) return byId;
        return nodeNameMap.get(ref);
      })
      .filter((id): id is number => id !== undefined);

    if (nodeIds.length === 0) {
      defaultLogger.warn('Insight references unknown entities', {
        nodes: insight.subject_nodes,
      });
      continue;
    }

    insightsToInsert.push({
      insight_type: insight.insight_type,
      subject_nodes: nodeIds,
      reasoning_path: insight.reasoning_path || undefined,
      confidence: insight.confidence,
    });
  }

  if (insightsToInsert.length > 0) {
    await db.insertInsights(insightsToInsert);
  }
}

export async function runPipeline(
  input: PaperInput,
  db?: DatabaseClient,
  logger: Logger = defaultLogger
): Promise<PipelineResult> {
  const startTime = Date.now();
  const dbClient = db || createDatabaseClient();

  try {
    logger.info(`Processing paper ${input.paper_id}`);

    logger.info('[Ingestion] Starting...');
    const trimmedRaw = input.raw_text.slice(0, 60000);
    const ingested = await runAgent<IngestionOutput>(
      'Ingestion',
      INGESTION_PROMPT,
      JSON.stringify({
        paper_id: input.paper_id,
        title: input.title,
        raw_text: trimmedRaw,
        metadata: input.metadata,
      }),
      IngestionSchema,
      { ...AGENT_CONFIG, timeoutMs: 180000, maxTokens: 24000 } // allow longer/larger responses for ingestion
    );

    logger.info(
      `[Ingestion] Success: ${ingested.sections.length} sections extracted`
    );

    if (ingested.warnings.length > 0) {
      logger.warn(`[Ingestion] Warnings: ${ingested.warnings.join('; ')}`);
    }

    const abstractSection = ingested.sections.find(
      (s) => s.section_type === 'abstract'
    );

    try {
      await dbClient.insertPaper({
        paper_id: ingested.paper_id,
        title: ingested.title || undefined,
        abstract: abstractSection?.content || undefined,
        year: ingested.year ?? undefined,
        metadata: {
          authors: ingested.authors,
          ...(input.metadata || {}),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate key')) {
        logger.warn(`[Pipeline] Paper ${ingested.paper_id} already exists, skipping insert`);
      } else {
        throw error;
      }
    }

    const sections = formatSectionsForDb(ingested.paper_id, ingested.sections);
    await dbClient.insertPaperSections(sections);

    logger.info('[EntityExtraction] Starting...');
    const entities = await runAgent<EntityOutput>(
      'EntityExtraction',
      ENTITY_EXTRACTION_PROMPT,
      JSON.stringify({
        paper_id: ingested.paper_id,
        sections: ingested.sections,
      }),
      EntitySchema
    );

    logger.info(
      `[EntityExtraction] Extracted ${entities.entities.length} entities with avg confidence ${(
        entities.entities.reduce(
          (sum, e) => sum + e.original_confidence,
          0
        ) / entities.entities.length || 0
      ).toFixed(2)}`
    );

    logger.info('[RelationshipExtraction] Starting...');
    const edges = await runAgent<EdgeOutput>(
      'RelationshipExtraction',
      RELATIONSHIP_EXTRACTION_PROMPT,
      JSON.stringify({
        entities: entities.entities,
        sections: ingested.sections,
        paper_id: ingested.paper_id,
      }),
      EdgeSchema,
      { ...AGENT_CONFIG, timeoutMs: 120000 }
    );

    logger.info(
      `[RelationshipExtraction] Extracted ${edges.edges.length} relationships`
    );

    logger.info('[Validation] Starting...');
    const validated = await runAgent<ValidationOutput>(
      'Validation',
      VALIDATION_PROMPT,
      JSON.stringify({
        entities: entities.entities,
        edges: edges.edges,
      }),
      ValidationSchema
    );

    const entityStats = {
      approved: validated.validated_entities.filter(
        (e) => e.decision === 'approved'
      ).length,
      flagged: validated.validated_entities.filter(
        (e) => e.decision === 'flagged'
      ).length,
      rejected: validated.validated_entities.filter(
        (e) => e.decision === 'rejected'
      ).length,
    };

    const edgeStats = {
      approved: validated.validated_edges.filter(
        (e) => e.decision === 'approved'
      ).length,
      flagged: validated.validated_edges.filter(
        (e) => e.decision === 'flagged'
      ).length,
      rejected: validated.validated_edges.filter(
        (e) => e.decision === 'rejected'
      ).length,
    };

    logger.info(
      `[Validation] Approved: ${entityStats.approved}/${validated.validated_entities.length} entities, ${edgeStats.approved}/${validated.validated_edges.length} edges (${edgeStats.flagged} flagged for review)`
    );

    // 5. Persist approved entities and edges
    const entityMap = await insertEntitiesWithDedup(
      dbClient,
      validated.validated_entities,
      ingested.paper_id,
      logger
    );

    let paperNode = await dbClient.findNodeByCanonicalName(
      ingested.paper_id,
      'Paper'
    );

    if (!paperNode) {
      paperNode = await dbClient.insertNode({
        type: 'Paper',
        canonical_name: ingested.paper_id,
        metadata: {
          title: ingested.title,
          year: ingested.year,
        },
      });
    }

    entityMap.set(ingested.paper_id, paperNode.id);

    await insertEdges(
      dbClient,
      validated.validated_edges,
      edges.edges,
      entityMap,
      logger
    );

    logger.info('[Reasoning] Starting...');
    const graphData = await dbClient.getGraphData();
    logger.info(`[Reasoning] Graph data: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
    
    const reasoningInput = {
      nodes: graphData.nodes.map(n => ({
        id: n.id.toString(),
        type: n.type,
        canonical_name: n.canonical_name,
        metadata: n.metadata,
      })),
      edges: graphData.edges.map(e => ({
        id: e.id.toString(),
        source_node_id: e.source_node_id.toString(),
        target_node_id: e.target_node_id.toString(),
        relationship_type: e.relationship_type,
        confidence: e.confidence,
        evidence: e.evidence || '',
      })),
      papers: [],
      total_papers_in_corpus: 1,
    };
    
    const inputSize = JSON.stringify(reasoningInput).length;
    logger.info(`[Reasoning] Input size: ${inputSize} chars`);
    
    const insights = await runAgent<InsightOutput>(
      'Reasoning',
      REASONING_PROMPT,
      JSON.stringify(reasoningInput),
      InsightSchema,
      REASONING_CONFIG
    );

    logger.info(
      `[Reasoning] Generated ${insights.insights.length} insights`
    );

    await insertInsights(dbClient, insights.insights, graphData.nodes);

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      paper_id: input.paper_id,
      stats: {
        sectionsExtracted: ingested.sections.length,
        entitiesExtracted: entities.entities.length,
        edgesExtracted: edges.edges.length,
        entitiesApproved: entityStats.approved,
        entitiesFlagged: entityStats.flagged,
        entitiesRejected: entityStats.rejected,
        edgesApproved: edgeStats.approved,
        edgesFlagged: edgeStats.flagged,
        edgesRejected: edgeStats.rejected,
        insightsGenerated: insights.insights.length,
        processingTimeMs: processingTime,
      },
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;

    if (error instanceof TimeoutError) {
      logger.error('[Pipeline] Agent timeout', {
        paper_id: input.paper_id,
        agent: error.agent,
        timeoutMs: error.timeoutMs,
      });
    } else if (error instanceof SchemaValidationError) {
      logger.error('[Pipeline] Schema validation failed after retries', {
        paper_id: input.paper_id,
        agent: error.agent,
        attempts: error.attempts,
      });
    } else if (error instanceof AgentExecutionError) {
      logger.error('[Pipeline] Agent execution failed', {
        paper_id: input.paper_id,
        agent: error.agent,
        originalError: error.originalError.message,
      });
    } else {
      logger.error('[Pipeline] Unexpected error', {
        paper_id: input.paper_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      success: false,
      paper_id: input.paper_id,
      error: error instanceof Error ? error.message : String(error),
      stats: {
        sectionsExtracted: 0,
        entitiesExtracted: 0,
        edgesExtracted: 0,
        entitiesApproved: 0,
        entitiesFlagged: 0,
        entitiesRejected: 0,
        edgesApproved: 0,
        edgesFlagged: 0,
        edgesRejected: 0,
        insightsGenerated: 0,
        processingTimeMs: processingTime,
      },
    };
  }
}


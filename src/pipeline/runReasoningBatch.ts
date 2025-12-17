import { v4 as uuidv4 } from 'uuid';
import { runAgent } from '../agents/runAgent';
import { REASONING_PROMPT } from '../agents/prompts';
import { InsightSchema, type InsightOutput } from '../agents/schemas';
import { REASONING_CONFIG, AGENT_MODELS } from '../agents/config';
import { DatabaseClient } from '../db/client';
import { PROMPT_VERSIONS, SCHEMA_VERSIONS } from '../agents/versions';
import { computeDerivedHash, writeDerivedCache, readDerivedCache } from '../cache/derived';
import { buildSubgraph } from '../reasoning/buildSubgraph';

interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
}

const defaultLogger: Logger = {
  error: (msg, ctx) => console.error(`[ReasoningBatch] ${msg}`, ctx || ''),
  warn: (msg, ctx) => console.warn(`[ReasoningBatch] ${msg}`, ctx || ''),
  info: (msg, ctx) => console.info(`[ReasoningBatch] ${msg}`, ctx || ''),
};

export async function runReasoningBatch(
  db: DatabaseClient,
  logger: Logger = defaultLogger,
  batchId: string = uuidv4(),
  affectedPaperIds: string[] = []
): Promise<void> {
  logger.info(`[ReasoningBatch] Starting batch ${batchId}`);
  
  const depth = Number(process.env.REASONING_DEPTH || '2');
  const { input: snapshotPayload, scope } = await buildSubgraph(
    db,
    affectedPaperIds,
    depth,
    process.env.REASON_FULL_GRAPH === '1',
    logger
  );

  logger.info(
    `[ReasoningBatch] Subgraph: ${snapshotPayload.nodes.length} nodes, ${snapshotPayload.edges.length} edges, scope: ${scope.paper_ids.length} papers at depth ${scope.depth}`
  );

  const graphSnapshotHash = computeDerivedHash(
    'graph_snapshot',
    snapshotPayload,
    SCHEMA_VERSIONS.insight,
    PROMPT_VERSIONS.reasoning
  );

  const cached = await readDerivedCache<typeof snapshotPayload>(
    'graph_snapshot',
    graphSnapshotHash
  );
  if (cached) {
    logger.info(`[ReasoningBatch] Using cached graph snapshot`);
  } else {
    await writeDerivedCache(
      'graph_snapshot',
      graphSnapshotHash,
      snapshotPayload,
      SCHEMA_VERSIONS.insight,
      PROMPT_VERSIONS.reasoning
    );
  }

  const snapshotPayloadStr = JSON.stringify(snapshotPayload);
  const insights = await runAgent<InsightOutput>(
    'Reasoning',
    REASONING_PROMPT,
    snapshotPayloadStr,
    InsightSchema,
    REASONING_CONFIG,
    logger,
    {
      input: snapshotPayload,
      promptVersion: PROMPT_VERSIONS.reasoning,
      schemaVersion: SCHEMA_VERSIONS.insight,
      provider: 'gemini',
      modelOverride: AGENT_MODELS.reasoning,
    }
  );

  logger.info(
    `[ReasoningBatch] Generated ${insights.insights.length} insights for batch ${batchId}`
  );

  await db.insertInsights(
    insights.insights.map((ins) => ({
      insight_type: ins.insight_type,
      subject_nodes: ins.subject_nodes.map((id) => Number(id)).filter((n) => !Number.isNaN(n)),
      reasoning_path: {
        ...(ins.reasoning_path || {}),
        meta: {
          batch_id: batchId,
          graph_snapshot_hash: graphSnapshotHash,
          scope: {
            paper_ids: scope.paper_ids,
            depth: scope.depth,
          },
        },
      },
      confidence: ins.confidence,
    }))
  );
}

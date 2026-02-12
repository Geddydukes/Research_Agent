import { runAgent } from '../agents/runAgent';
import { AGENT_CONFIG, AGENT_MODELS, REASONING_CONFIG } from '../agents/config';
import {
  IngestionSchema,
  EntitySchema,
  RelationshipCoreSchema,
  RelationshipEvidenceSchema,
  InsightSchema,
  type IngestionOutput,
  type EntityOutput,
  type RelationshipCoreOutput,
  type RelationshipEvidenceOutput,
  type ValidationOutput,
  type InsightOutput,
} from '../agents/schemas';
import {
  INGESTION_PROMPT,
  ENTITY_EXTRACTION_PROMPT,
  RELATIONSHIP_CORE_PROMPT,
  RELATIONSHIP_EVIDENCE_PROMPT,
  REASONING_PROMPT,
} from '../agents/prompts';
import { createDatabaseClient, DatabaseClient, type PaperSection } from '../db/client';
import {
  TimeoutError,
  SchemaValidationError,
  AgentExecutionError,
} from '../agents/errors';
import type { PaperInput, PipelineResult } from './types';
import { PROMPT_VERSIONS, SCHEMA_VERSIONS } from '../agents/versions';
import { validateEntitiesAndEdges } from '../agents/validationRules';
import { canonicalize } from '../utils/canonicalize';
import {
  computeDerivedHash,
  readDerivedCache,
  writeDerivedCache,
  getCacheStats,
  resetCacheStats,
} from '../cache/derived';
import { buildSubgraph } from '../reasoning/buildSubgraph';
import { decrypt } from '../services/encryption';
import { EmbeddingsClient } from '../embeddings/embed';
import { normalizeTextForEmbedding } from '../embeddings/similarity';
import { EntityEmbeddingService, type EntityContext } from '../entities/embeddingService';
import { EntityResolver } from '../entities/resolver';

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
  originalEntities: EntityOutput['entities'], // Original entities with metadata
  paperId: string,
  paperTitle: string | undefined,
  paperSections: Array<{ section_type: string; content: string }>,
  apiKey: string | undefined,
  tenantId: string,
  logger: Logger = defaultLogger
): Promise<Map<string, number>> {
  const startTime = Date.now();
  const entityMap = new Map<string, number>();

  // Persist ALL entities (including rejected) so they can be reviewed later
  const entitiesToProcess = validatedEntities;
  
  if (entitiesToProcess.length === 0) {
    logger.info('[Pipeline] No entities to insert');
    return entityMap;
  }

  const flaggedEntities = entitiesToProcess.filter((e) => e.decision === 'flagged');
  const rejectedEntities = entitiesToProcess.filter((e) => e.decision === 'rejected');
  if (flaggedEntities.length > 0) {
    logger.info(`[Pipeline] ${flaggedEntities.length} entities flagged for review`);
  }
  if (rejectedEntities.length > 0) {
    logger.info(`[Pipeline] ${rejectedEntities.length} entities rejected (persisted for review)`);
  }

  // Initialize embedding service and resolver if API key available
  let embeddingService: EntityEmbeddingService | null = null;
  let resolver: EntityResolver | null = null;
  if (apiKey) {
    embeddingService = new EntityEmbeddingService(apiKey);
    resolver = new EntityResolver(embeddingService);
  }

  const lookupPairs = entitiesToProcess.map((entity) => ({
    canonical_name: canonicalize(entity.canonical_name),
    type: entity.type,
  }));

  // Create map from canonical name to original entity for metadata access
  const originalEntityMap = new Map<string, EntityOutput['entities'][0]>();
  for (const origEntity of originalEntities) {
    const canonicalKey = canonicalize(origEntity.canonical_name);
    originalEntityMap.set(canonicalKey, origEntity);
  }

  const lookupStart = Date.now();
  const existingNodes = await db.findNodesByCanonicalNames(lookupPairs);
  logger.info(`[Pipeline] Entity dedupe lookup: ${Date.now() - lookupStart}ms for ${lookupPairs.length} entities`);

  const nodesToInsert: Array<{
    type: string;
    canonical_name: string;
    original_confidence: number;
    adjusted_confidence: number;
    review_status: 'approved' | 'flagged' | 'rejected';
    review_reasons: string | undefined;
    metadata: Record<string, unknown>;
    embedding_raw?: number[];
    embedding_index?: number[];
    entityIndex: number;
  }> = [];

  const linkProposals: Array<{
    nodeId: number;
    canonicalNodeId: number;
    confidence: number;
    sharedAlias: boolean;
    sharedPhrase: boolean;
    autoApprove: boolean;
    entityIndex: number;
  }> = [];

  const aliasInserts: Array<{ nodeId: number; aliasName: string }> = [];

  for (let i = 0; i < entitiesToProcess.length; i++) {
    const entity = entitiesToProcess[i]!;
    const canonicalKey = lookupPairs[i]!.canonical_name;
    const key = `${canonicalKey}|${entity.type}`;
    
    const existingNode = existingNodes.get(key);
    if (existingNode) {
      // Exact match found
      entityMap.set(canonicalKey, existingNode.id);
      
      // Store alias for original name if different
      if (entity.canonical_name !== canonicalKey) {
        aliasInserts.push({
          nodeId: existingNode.id,
          aliasName: entity.canonical_name,
        });
      }
    } else {
      // No exact match - try semantic resolution if resolver available
      let resolvedNodeId: number | null = null;
      let shouldCreateLink = false;
      let linkData: typeof linkProposals[0] | null = null;
      let embeddingPair: { raw: number[]; index: number[] } | null = null;

      if (resolver && embeddingService) {
        try {
          // Build entity context from paper sections
          const entitySection = paperSections.find(s => 
            s.content.toLowerCase().includes(entity.canonical_name.toLowerCase())
          );
          const evidence = entitySection?.content || '';
          // Get definition from original entity if available
          const origEntity = originalEntityMap.get(canonicalKey);
          const entityDefinition = origEntity?.metadata?.definition as string | undefined || 
                           entitySection?.content.slice(0, 200);

          const entityContext: EntityContext = {
            name: entity.canonical_name,
            type: entity.type,
            definition: entityDefinition,
            paperTitle,
            evidence: evidence.slice(0, 500), // Limit evidence length
          };

          // Generate embeddings once
          embeddingPair = await embeddingService.generateEmbedding(entityContext, tenantId);

          // Resolve entity
          const resolution = await resolver.resolveEntity(entityContext, embeddingPair, db);

          if (resolution.action === 'exact_match' && resolution.canonicalNodeId) {
            resolvedNodeId = resolution.canonicalNodeId;
            entityMap.set(canonicalKey, resolvedNodeId);
            
            // Store alias
            aliasInserts.push({
              nodeId: resolvedNodeId,
              aliasName: entity.canonical_name,
            });
          } else if (resolution.action === 'auto_approve' && resolution.canonicalNodeId && resolution.linkProposal) {
            // Will create node and link after insertion
            shouldCreateLink = true;
            linkData = {
              canonicalNodeId: resolution.canonicalNodeId,
              confidence: resolution.linkProposal.confidence,
              sharedAlias: resolution.linkProposal.sharedAlias,
              sharedPhrase: resolution.linkProposal.sharedPhrase,
              autoApprove: true,
              nodeId: 0, // Will be set after node creation
              entityIndex: i,
            };
          } else if (resolution.action === 'propose_link' && resolution.canonicalNodeId && resolution.linkProposal) {
            // Will create node and proposal after insertion
            shouldCreateLink = true;
            linkData = {
              canonicalNodeId: resolution.canonicalNodeId,
              confidence: resolution.linkProposal.confidence,
              sharedAlias: resolution.linkProposal.sharedAlias,
              sharedPhrase: resolution.linkProposal.sharedPhrase,
              autoApprove: false,
              nodeId: 0, // Will be set after node creation
              entityIndex: i,
            };
          }
        } catch (err) {
          logger.warn(`[Pipeline] Entity resolution failed for ${entity.canonical_name}: ${err instanceof Error ? err.message : String(err)}`);
          // Fall through to create new node
        }
      }

      // Create new node if not resolved
      if (!resolvedNodeId) {
        nodesToInsert.push({
          type: entity.type,
          canonical_name: canonicalKey,
          original_confidence: entity.original_confidence,
          adjusted_confidence: entity.adjusted_confidence,
          review_status: entity.decision,
          review_reasons: entity.reason,
          metadata: {
            display_name: entity.canonical_name,
            definition: originalEntityMap.get(canonicalKey)?.metadata?.definition,
          },
          embedding_raw: embeddingPair?.raw,
          embedding_index: embeddingPair?.index,
          entityIndex: i,
        });

        if (shouldCreateLink && linkData) {
          linkProposals.push({ ...linkData, entityIndex: i });
        }
      }
    }
  }

  if (nodesToInsert.length > 0) {
    const insertStart = Date.now();
    const nodesForInsert = nodesToInsert.map(({ entityIndex, ...node }) => ({
      ...node,
      review_reasons: node.review_reasons || undefined,
    }));
    const insertedNodes = await db.insertNodes(nodesForInsert);
    logger.info(`[Pipeline] Node batch insert: ${Date.now() - insertStart}ms for ${insertedNodes.length} nodes`);

    const linkProposalByEntityIndex = new Map<number, typeof linkProposals[number]>();
    for (const proposal of linkProposals) {
      linkProposalByEntityIndex.set(proposal.entityIndex, proposal);
    }

    const canonicalNodeIds = Array.from(
      new Set(linkProposals.map((proposal) => proposal.canonicalNodeId))
    );
    const aliasTargetsByNodeId = await db.getApprovedAliasTargetsForNodes(canonicalNodeIds);

    // Update entity map and create links
    for (let i = 0; i < nodesToInsert.length; i++) {
      const canonicalKey = lookupPairs[nodesToInsert[i]!.entityIndex]!.canonical_name;
      const newNodeId = insertedNodes[i]!.id;
      entityMap.set(canonicalKey, newNodeId);

      // Update link proposals with actual node IDs
      const linkProposal = linkProposalByEntityIndex.get(nodesToInsert[i]!.entityIndex);
      if (linkProposal) {
        linkProposal.nodeId = newNodeId;

        const aliasTarget = aliasTargetsByNodeId.get(linkProposal.canonicalNodeId);
        if (aliasTarget) {
          // If the selected canonical node is itself an alias, use its approved canonical target.
          linkProposal.canonicalNodeId = aliasTarget;
        }

        // Create entity link
        try {
          await db.insertEntityLink({
            node_id: newNodeId,
            canonical_node_id: linkProposal.canonicalNodeId,
            link_type: 'alias_of',
            confidence: linkProposal.confidence,
            status: linkProposal.autoApprove ? 'approved' : 'proposed',
            evidence: linkProposal.sharedPhrase ? 'Shared phrase detected' : undefined,
          });
          
          if (linkProposal.autoApprove) {
            logger.info(`[Pipeline] Auto-approved entity link: ${newNodeId} -> ${linkProposal.canonicalNodeId}`);
          } else {
            logger.info(`[Pipeline] Proposed entity link: ${newNodeId} -> ${linkProposal.canonicalNodeId}`);
          }
        } catch (err) {
          logger.warn(`[Pipeline] Failed to create entity link: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Store alias for original name
      const entity = entitiesToProcess[nodesToInsert[i]!.entityIndex]!;
      if (entity.canonical_name !== canonicalKey) {
        aliasInserts.push({
          nodeId: newNodeId,
          aliasName: entity.canonical_name,
        });
      }
    }
  }

  // Insert aliases
  if (aliasInserts.length > 0) {
    const aliasPromises = aliasInserts.map(async ({ nodeId, aliasName }) => {
      try {
        await db.insertEntityAlias({
          node_id: nodeId,
          alias_name: aliasName,
          source_paper_id: paperId,
        });
      } catch (err) {
        // Ignore duplicate alias errors
        if (!(err instanceof Error && err.message.includes('duplicate'))) {
          logger.warn(`[Pipeline] Failed to insert alias: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });
    await Promise.allSettled(aliasPromises);
  }

  const mentionsStart = Date.now();
  const mentions = Array.from(entityMap.values()).map((nodeId) => ({
    node_id: nodeId,
    paper_id: paperId,
    mention_count: 1,
  }));
  
  await db.insertEntityMentions(mentions);
  logger.info(`[Pipeline] Mention batch insert: ${Date.now() - mentionsStart}ms for ${mentions.length} mentions`);

  logger.info(`[Pipeline] Entity dedupe total: ${Date.now() - startTime}ms (${entitiesToProcess.length} entities, ${nodesToInsert.length} new nodes, ${linkProposals.length} links created)`);
  
  return entityMap;
}

async function insertEdges(
  db: DatabaseClient,
  validatedEdges: ValidationOutput['validated_edges'],
  evidenceMap: Map<string, { evidence: string; sectionId?: number; sectionType?: string; partIndex?: number }>,
  entityMap: Map<string, number>,
  logger: Logger = defaultLogger,
  sourcePaperId?: string
): Promise<Map<string, number>> {
  const edgesToInsert = [];
  const edgeKeys: string[] = [];

  // Persist ALL edges (including rejected) so they can be reviewed later
  for (const validatedEdge of validatedEdges) {
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

    const key = `${validatedEdge.source_canonical_name}::${validatedEdge.relationship_type}::${validatedEdge.target_canonical_name}`;
    edgeKeys.push(key);
    const evidenceData = evidenceMap.get(key);

    edgesToInsert.push({
      source_node_id: sourceId,
      target_node_id: targetId,
      relationship_type: validatedEdge.relationship_type,
      confidence: validatedEdge.confidence,
      evidence: evidenceData?.evidence?.slice(0, 300) || undefined,
      review_status: validatedEdge.decision,
      review_reasons: validatedEdge.reason || undefined,
      provenance: {
        section_id: evidenceData?.sectionId,
        section_type: evidenceData?.sectionType,
        part_index: evidenceData?.partIndex,
        meta: {
          source_paper_id: sourcePaperId,
          validation_status: validatedEdge.decision,
          validation_reasons: validatedEdge.reason ? [validatedEdge.reason] : [],
        },
      } as Record<string, unknown>,
    });
  }

  const edgeIdByKey = new Map<string, number>();
  if (edgesToInsert.length > 0) {
    const inserted = await db.insertEdges(edgesToInsert);
    for (let i = 0; i < inserted.length; i++) {
      edgeIdByKey.set(edgeKeys[i]!, inserted[i]!.id);
    }
  }

  return edgeIdByKey;
}


export async function runPipeline(
  input: PaperInput,
  tenantId: string,
  db?: DatabaseClient,
  logger: Logger = defaultLogger,
  options?: { runReasoning?: boolean; forceReingest?: boolean; reasoningDepth?: number; onProgress?: (stage: string) => void }
): Promise<PipelineResult> {
  const startTime = Date.now();
  const dbClient = db || createDatabaseClient(tenantId);
  const runReasoning =
    options?.runReasoning ?? process.env.REASONING_ENABLED === 'true';
  const forceReingest = options?.forceReingest ?? process.env.FORCE_REINGEST === '1';

  // Load tenant settings
  const tenantSettings = await dbClient.getTenantSettings();
  if (!tenantSettings) {
    throw new Error(`Tenant settings not found for tenant ${tenantId}`);
  }

  resetCacheStats();
  const reportProgress = (stage: string) => {
    try {
      options?.onProgress?.(stage);
    } catch {
      // ignore progress errors
    }
  };

  let tenantApiKey: string | undefined;
  if (tenantSettings.execution_mode === 'byo_key' && tenantSettings.api_key_encrypted) {
    try {
      tenantApiKey = await decrypt(tenantSettings.api_key_encrypted);
    } catch (error) {
      logger.error(`Failed to decrypt tenant API key: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to decrypt tenant API key for BYO key mode');
    }
  }

  try {
    logger.info(`Processing paper ${input.paper_id}`);

    if (!forceReingest) {
      const exists = await dbClient.paperExists(input.paper_id);
      if (exists) {
        logger.info(`[Pipeline] Paper ${input.paper_id} already exists, skipping`);
        return {
          success: true,
          paper_id: input.paper_id,
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
            processingTimeMs: Date.now() - startTime,
            reasoningSkipped: !runReasoning,
          },
        };
      }
    }

    logger.info('[Ingestion] Starting...');
    reportProgress('ingestion');
    const trimmedRaw = input.raw_text.slice(0, 60000);
    const ingestionInput = {
      paper_id: input.paper_id,
      title: input.title,
      raw_text: trimmedRaw,
      metadata: input.metadata,
    };
    const ingested = await runAgent<IngestionOutput>(
      'Ingestion',
      INGESTION_PROMPT,
      JSON.stringify(ingestionInput),
      IngestionSchema,
      { ...AGENT_CONFIG, timeoutMs: 180000, maxTokens: 24000 },
      logger,
      {
        input: ingestionInput,
        promptVersion: PROMPT_VERSIONS.ingestion,
        schemaVersion: SCHEMA_VERSIONS.ingestion,
        provider: 'gemini',
        modelOverride: AGENT_MODELS.ingestion,
        tenantId,
        executionMode: tenantSettings.execution_mode,
        apiKeyOverride: tenantApiKey,
      }
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

    await dbClient.upsertPaper({
      paper_id: ingested.paper_id,
      title: ingested.title || undefined,
      abstract: abstractSection?.content || undefined,
      year: ingested.year ?? undefined,
      metadata: {
        authors: ingested.authors,
        ...(input.metadata || {}),
      },
    });

    // Compute and store embedding for the paper
    const apiKey = tenantApiKey || process.env.GOOGLE_API_KEY;
    if (apiKey && (ingested.title || abstractSection?.content)) {
      try {
        const emb = new EmbeddingsClient(apiKey);
        const paperText = normalizeTextForEmbedding(
          ingested.title || '',
          abstractSection?.content || ''
        );
        const [embedding] = await emb.embedTexts([paperText], tenantId, 'gemini-embedding-001');
        
        if (embedding) {
          await dbClient.upsertPaperEmbedding(ingested.paper_id, embedding);
          logger.info(`[Pipeline] Stored embedding for ${ingested.paper_id}`);
        }
      } catch (err) {
        logger.warn(`[Pipeline] Failed to store embedding: ${err instanceof Error ? err.message : String(err)}`);
        // Don't fail the pipeline if embedding storage fails
      }
    }

    const sections = formatSectionsForDb(ingested.paper_id, ingested.sections);
    const sectionsHash = computeDerivedHash(
      'sections',
      { paper_id: ingested.paper_id, sections: ingested.sections },
      SCHEMA_VERSIONS.ingestion,
      PROMPT_VERSIONS.ingestion
    );
    const cachedSections = await readDerivedCache<PaperSection[]>(
      'sections',
      sectionsHash,
      tenantId
    );
    let insertedSections: PaperSection[];
    if (cachedSections) {
      insertedSections = cachedSections;
    } else {
      insertedSections = await dbClient.insertPaperSections(sections);
      await writeDerivedCache(
        'sections',
        sectionsHash,
        insertedSections,
        SCHEMA_VERSIONS.ingestion,
        PROMPT_VERSIONS.ingestion,
        tenantId
      );
    }
    const sectionIdByPartIndex = new Map<number, number>();
    for (const sec of insertedSections) {
      sectionIdByPartIndex.set(sec.part_index, sec.id);
    }

    logger.info('[EntityExtraction] Starting...');
    reportProgress('entity_extraction');
    const entityInput = {
      paper_id: ingested.paper_id,
      sections: ingested.sections,
    };
    const entities = await runAgent<EntityOutput>(
      'EntityExtraction',
      ENTITY_EXTRACTION_PROMPT,
      JSON.stringify(entityInput),
      EntitySchema,
      AGENT_CONFIG,
      logger,
      {
        input: entityInput,
        promptVersion: PROMPT_VERSIONS.entityExtraction,
        schemaVersion: SCHEMA_VERSIONS.entityExtraction,
        provider: 'gemini',
        modelOverride: AGENT_MODELS.entityExtraction,
        tenantId,
        executionMode: tenantSettings.execution_mode,
        apiKeyOverride: tenantApiKey,
      }
    );

    if (entities.entities.length > 0) {
      let totalConfidence = 0;
      for (const e of entities.entities) {
        totalConfidence += e.original_confidence;
      }
      const avgConfidence = (totalConfidence / entities.entities.length).toFixed(2);
      logger.info(`[EntityExtraction] Extracted ${entities.entities.length} entities with avg confidence ${avgConfidence}`);
    } else {
      logger.info(`[EntityExtraction] Extracted 0 entities`);
    }

    logger.info('[RelationshipCoreExtraction] Starting...');
    reportProgress('relationship_extraction');
    const relationshipInput = {
      entities: entities.entities,
      sections: ingested.sections,
      paper_id: ingested.paper_id,
    };
    const coreRelationships = await runAgent<RelationshipCoreOutput>(
      'RelationshipCoreExtraction',
      RELATIONSHIP_CORE_PROMPT,
      JSON.stringify(relationshipInput),
      RelationshipCoreSchema,
      { ...AGENT_CONFIG, timeoutMs: 60000 },
      logger,
      {
        input: relationshipInput,
        promptVersion: PROMPT_VERSIONS.relationshipExtraction,
        schemaVersion: SCHEMA_VERSIONS.relationshipExtraction,
        provider: 'gemini',
        modelOverride: AGENT_MODELS.relationshipExtraction,
        tenantId,
        executionMode: tenantSettings.execution_mode,
        apiKeyOverride: tenantApiKey,
      }
    );

    logger.info(
      `[RelationshipCoreExtraction] Extracted ${coreRelationships.relationships.length} relationships`
    );

    const allowedRelationshipTypes = (tenantSettings.enabled_relationship_types || []).map((t) => t.toLowerCase());
    const filteredRelationships = allowedRelationshipTypes.length > 0
      ? coreRelationships.relationships.filter((rel) =>
          allowedRelationshipTypes.includes(rel.relationship_type.toLowerCase())
        )
      : coreRelationships.relationships;

    const relationshipsSorted = [...filteredRelationships].sort((a, b) => {
      const keyA = `${a.source_canonical_name}::${a.relationship_type}::${a.target_canonical_name}`;
      const keyB = `${b.source_canonical_name}::${b.relationship_type}::${b.target_canonical_name}`;
      return keyA.localeCompare(keyB);
    });

    const relationshipCandidatesHash = computeDerivedHash(
      'relationship_candidates',
      {
        paper_id: ingested.paper_id,
        relationships: relationshipsSorted,
      },
      SCHEMA_VERSIONS.relationshipExtraction,
      PROMPT_VERSIONS.relationshipExtraction
    );

    const cachedRelationships = await readDerivedCache<typeof relationshipsSorted>(
      'relationship_candidates',
      relationshipCandidatesHash,
      tenantId
    );

    const coreEdgesForValidation = (cachedRelationships || relationshipsSorted).map((rel) => ({
      source_canonical_name: rel.source_canonical_name,
      target_canonical_name: rel.target_canonical_name,
      source_type: 'Entity',
      target_type: 'Entity',
      relationship_type: rel.relationship_type,
      confidence: rel.confidence,
      evidence: '',
      provenance: {},
    }));

    if (!cachedRelationships) {
      await writeDerivedCache(
        'relationship_candidates',
        relationshipCandidatesHash,
        relationshipsSorted,
        SCHEMA_VERSIONS.relationshipExtraction,
        PROMPT_VERSIONS.relationshipExtraction,
        tenantId
      );
    }

    logger.info('[Validation] Starting (deterministic rules)...');
    reportProgress('validation');
    const validated = validateEntitiesAndEdges(entities.entities, coreEdgesForValidation);

    const entityStats = { approved: 0, flagged: 0, rejected: 0 };
    const edgeStats = { approved: 0, flagged: 0, rejected: 0 };

    for (const e of validated.validated_entities) {
      entityStats[e.decision]++;
    }

    for (const e of validated.validated_edges) {
      edgeStats[e.decision]++;
    }

    logger.info(
      `[Validation] Approved: ${entityStats.approved}/${validated.validated_entities.length} entities, ${edgeStats.approved}/${validated.validated_edges.length} edges (${edgeStats.flagged} flagged, ${edgeStats.rejected} rejected)`
    );

    // 5. Persist all entities and edges (including flagged/rejected for review)
    reportProgress('persist_entities_edges');
    const entityMap = await insertEntitiesWithDedup(
      dbClient,
      validated.validated_entities,
      entities.entities, // Original entities with metadata
      ingested.paper_id,
      ingested.title,
      ingested.sections,
      tenantApiKey || process.env.GOOGLE_API_KEY,
      tenantId,
      logger
    );

    const entitiesForCache = Array.from(entityMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    const mergedEntitiesHash = computeDerivedHash(
      'entities',
      {
        paper_id: ingested.paper_id,
        entities: entitiesForCache.map(([name, id]) => ({ name, id })),
      },
      SCHEMA_VERSIONS.entityExtraction,
      PROMPT_VERSIONS.entityExtraction
    );
    
    const cachedEntities = await readDerivedCache<Array<[string, number]>>(
      'entities',
      mergedEntitiesHash,
      tenantId
    );
    
    if (!cachedEntities) {
      await writeDerivedCache(
        'entities',
        mergedEntitiesHash,
        entitiesForCache,
        SCHEMA_VERSIONS.entityExtraction,
        PROMPT_VERSIONS.entityExtraction,
        tenantId
      );
    }

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
        review_status: 'approved', // Paper nodes are always approved for graph structure
      });
    }

    entityMap.set(ingested.paper_id, paperNode.id);

    const approvedEdges = validated.validated_edges
      .filter((e) => e.decision === 'approved' || e.decision === 'flagged')
      .sort((a, b) => {
        const keyA = `${a.source_canonical_name}::${a.relationship_type}::${a.target_canonical_name}`;
        const keyB = `${b.source_canonical_name}::${b.relationship_type}::${b.target_canonical_name}`;
        return keyA.localeCompare(keyB);
      });

    const edgeInsertStart = Date.now();
    const edgeIdByKey = await insertEdges(
      dbClient,
      validated.validated_edges,
      new Map(),
      entityMap,
      logger,
      ingested.paper_id
    );
    logger.info(`[Pipeline] Edge batch insert: ${Date.now() - edgeInsertStart}ms for ${edgeIdByKey.size} edges`);

    if (approvedEdges.length > 0) {
    logger.info('[RelationshipEvidenceEnrichment] Starting...');
    reportProgress('evidence');
      
      const approvedEdgeKeys = approvedEdges.map((ve) => 
        `${ve.source_canonical_name}::${ve.relationship_type}::${ve.target_canonical_name}`
      );
      
      const relationshipInputs = approvedEdges.map((ve, idx) => ({
        edge_key: approvedEdgeKeys[idx]!,
        source_canonical_name: ve.source_canonical_name,
        target_canonical_name: ve.target_canonical_name,
        relationship_type: ve.relationship_type,
      }));

      const sectionsForEvidence = ingested.sections.map((s, idx) => ({
        section_type: s.section_type,
        content: s.content,
        part_index: s.part_index ?? idx,
      }));

      const evidenceInput = {
        paper_id: ingested.paper_id,
        sections: sectionsForEvidence,
        relationships: relationshipInputs,
      };
      
      const evidenceInputStr = JSON.stringify(evidenceInput);
      
      const evidenceData = await runAgent<RelationshipEvidenceOutput>(
        'RelationshipEvidenceEnrichment',
        RELATIONSHIP_EVIDENCE_PROMPT,
        evidenceInputStr,
        RelationshipEvidenceSchema,
        { ...AGENT_CONFIG, timeoutMs: 60000 },
        logger,
        {
          input: evidenceInput,
          promptVersion: PROMPT_VERSIONS.relationshipExtraction,
          schemaVersion: SCHEMA_VERSIONS.relationshipExtraction,
          provider: 'gemini',
          modelOverride: AGENT_MODELS.relationshipExtraction,
          tenantId,
          executionMode: tenantSettings.execution_mode,
          apiKeyOverride: tenantApiKey,
        }
      );

      logger.info(
        `[RelationshipEvidenceEnrichment] Enriched ${evidenceData.evidence.length} edges with evidence`
      );

      const evidenceMap = new Map(
        evidenceData.evidence.map((ev) => [
          ev.edge_key,
          {
            evidence: ev.evidence,
            sectionId: ev.section_id,
            sectionType: ev.section_type,
            partIndex: ev.part_index,
          },
        ])
      );

      const evidenceUpdates: Array<{
        edgeId: number;
        evidence: string;
        provenance: Record<string, unknown>;
      }> = [];
      
      for (let i = 0; i < approvedEdges.length; i++) {
        const ve = approvedEdges[i]!;
        const key = approvedEdgeKeys[i]!;
        const edgeId = edgeIdByKey.get(key);
        const evData = evidenceMap.get(key);
        if (edgeId && evData) {
          evidenceUpdates.push({
            edgeId,
            evidence: evData.evidence,
            provenance: {
              section_id: evData.sectionId,
              section_type: evData.sectionType,
              part_index: evData.partIndex,
              meta: {
                source_paper_id: ingested.paper_id,
                validation_status: ve.decision,
                validation_reasons: ve.reason ? [ve.reason] : [],
              },
            },
          });
        }
      }

      if (evidenceUpdates.length > 0) {
        const evidenceStart = Date.now();
        await dbClient.updateEdgesEvidence(evidenceUpdates);
        logger.info(`[Pipeline] Edge evidence batch update: ${Date.now() - evidenceStart}ms for ${evidenceUpdates.length} edges`);
      }
    }

    let insights: InsightOutput | null = null;
    if (!runReasoning) {
      logger.info('[Reasoning] Skipped (disabled or batched)');
    } else {
      reportProgress('reasoning');
      logger.info('[Reasoning] Starting...');
      const useFullGraph = process.env.REASON_FULL_GRAPH === '1';
      if (!useFullGraph) {
        logger.info('[Reasoning] Using subgraph fetch (set REASON_FULL_GRAPH=1 to use full corpus)');
      }
      
      const depth = options?.reasoningDepth
        ?? tenantSettings.max_reasoning_depth
        ?? Number(process.env.REASONING_DEPTH || '2');
      const { input: reasoningInput, scope } = await buildSubgraph(
        dbClient,
        [ingested.paper_id],
        depth,
        useFullGraph,
        logger
      );

      logger.info(
        `[Reasoning] Subgraph: ${reasoningInput.nodes.length} nodes, ${reasoningInput.edges.length} edges, scope: ${scope.paper_ids.length} papers at depth ${scope.depth}`
      );

      const reasoningInputStr = JSON.stringify(reasoningInput);
      const inputSize = reasoningInputStr.length;
      const graphSnapshotHash = computeDerivedHash(
        'graph_snapshot',
        reasoningInput,
        SCHEMA_VERSIONS.insight,
        PROMPT_VERSIONS.reasoning
      );
      logger.info(`[Reasoning] Input size: ${inputSize} chars`);

      insights = await runAgent<InsightOutput>(
        'Reasoning',
        REASONING_PROMPT,
        reasoningInputStr,
        InsightSchema,
        REASONING_CONFIG,
        logger,
        {
          input: reasoningInput,
          promptVersion: PROMPT_VERSIONS.reasoning,
          schemaVersion: SCHEMA_VERSIONS.insight,
          provider: 'gemini',
          modelOverride: AGENT_MODELS.reasoning,
          tenantId,
          executionMode: tenantSettings.execution_mode,
          apiKeyOverride: tenantApiKey,
        }
      );

      logger.info(`[Reasoning] Generated ${insights.insights.length} insights`);

      await dbClient.insertInsights(
        insights.insights.map((ins) => ({
          insight_type: ins.insight_type,
          subject_nodes: ins.subject_nodes.map((id) => Number(id)).filter((n) => !Number.isNaN(n)),
          reasoning_path: {
            ...(ins.reasoning_path || {}),
            meta: {
              batch_id: `per-paper-${ingested.paper_id}`,
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

    const processingTime = Date.now() - startTime;
    const cacheStats = getCacheStats();

    const cacheReport = Object.entries(cacheStats)
      .map(([type, stats]) => `${type}: ${stats.hits}H/${stats.misses}M`)
      .join(', ');

    logger.info(`[Pipeline] Cache: ${cacheReport || 'none'}`);
    logger.info(`[Pipeline] Total time: ${processingTime}ms`);

    // Verification: Check graph consistency
    // Ensure no approved edge references a non-approved node
    const approvedNodeCanonicalNames = new Set(
      validated.validated_entities
        .filter((e) => e.decision === 'approved')
        .map((e) => e.canonical_name)
    );

    const inconsistentEdges: Array<{ edge: string; reason: string }> = [];
    for (const edge of validated.validated_edges) {
      if (edge.decision === 'approved') {
        const sourceApproved = approvedNodeCanonicalNames.has(edge.source_canonical_name);
        const targetApproved = approvedNodeCanonicalNames.has(edge.target_canonical_name);
        
        if (!sourceApproved || !targetApproved) {
          inconsistentEdges.push({
            edge: `${edge.source_canonical_name} -> ${edge.target_canonical_name}`,
            reason: `Approved edge references ${!sourceApproved ? 'non-approved source' : 'non-approved target'}`,
          });
        }
      }
    }

    if (inconsistentEdges.length > 0) {
      logger.warn(`[Pipeline] Graph consistency check: ${inconsistentEdges.length} approved edges reference non-approved nodes`, {
        sample: inconsistentEdges.slice(0, 5),
      });
    } else {
      logger.info('[Pipeline] Graph consistency check: All approved edges reference approved nodes ✓');
    }

    // Final summary
    logger.info(`[Pipeline] Persistence summary:`, {
      entities: {
        approved: entityStats.approved,
        flagged: entityStats.flagged,
        rejected: entityStats.rejected,
        total: validated.validated_entities.length,
      },
      edges: {
        approved: edgeStats.approved,
        flagged: edgeStats.flagged,
        rejected: edgeStats.rejected,
        total: validated.validated_edges.length,
      },
      graphConsistency: inconsistentEdges.length === 0 ? 'valid' : `warning: ${inconsistentEdges.length} issues`,
    });

    reportProgress('completed');
    return {
      success: true,
      paper_id: input.paper_id,
      stats: {
        sectionsExtracted: ingested.sections.length,
        entitiesExtracted: entities.entities.length,
        edgesExtracted: coreRelationships.relationships.length,
        entitiesApproved: entityStats.approved,
        entitiesFlagged: entityStats.flagged,
        entitiesRejected: entityStats.rejected,
        edgesApproved: edgeStats.approved,
        edgesFlagged: edgeStats.flagged,
        edgesRejected: edgeStats.rejected,
        insightsGenerated: insights?.insights.length ?? 0,
        processingTimeMs: processingTime,
        reasoningSkipped: insights === null,
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
        reasoningSkipped: !runReasoning,
      },
    };
  }
}

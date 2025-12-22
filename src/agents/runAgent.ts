import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AGENT_CONFIG, AGENT_MODELS, AgentConfig } from './config';
import {
  TimeoutError,
  SchemaValidationError,
  AgentExecutionError,
} from './errors';
import {
  buildCacheEntry,
  buildCacheKey,
  CacheEntry,
  readCache,
  writeCache,
} from '../utils/cache';
import { PROMPT_VERSIONS, SCHEMA_VERSIONS } from './versions';
import { limit } from '../utils/limiter';
import { createUsageTrackingService } from '../services/usageTracking';

interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
}

const defaultLogger: Logger = {
  error: (msg, ctx) => console.error(`[ERROR] ${msg}`, ctx || ''),
  warn: (msg, ctx) => console.warn(`[WARN] ${msg}`, ctx || ''),
  info: (msg, ctx) => console.info(`[INFO] ${msg}`, ctx || ''),
};


function formatValidationErrors(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `- ${path}: ${issue.message}`;
  });
  return `Schema validation errors:\n${issues.join('\n')}`;
}

function getModelForAgent(agentName: string): string {
  const normalizedName = agentName.toLowerCase();
  if (normalizedName.includes('ingestion')) {
    return AGENT_MODELS.ingestion;
  }
  if (normalizedName.includes('entity')) {
    return AGENT_MODELS.entityExtraction;
  }
  if (normalizedName.includes('relationship')) {
    return AGENT_MODELS.relationshipExtraction;
  }
  if (normalizedName.includes('validation')) {
    return AGENT_MODELS.validation;
  }
  if (normalizedName.includes('reasoning')) {
    return AGENT_MODELS.reasoning;
  }
  return AGENT_MODELS.entityExtraction;
}

function getPromptVersionForAgent(agentName: string): string {
  const normalizedName = agentName.toLowerCase();
  if (normalizedName.includes('ingestion')) return PROMPT_VERSIONS.ingestion;
  if (normalizedName.includes('entity')) return PROMPT_VERSIONS.entityExtraction;
  if (normalizedName.includes('relationship'))
    return PROMPT_VERSIONS.relationshipExtraction;
  if (normalizedName.includes('validation')) return PROMPT_VERSIONS.validation;
  if (normalizedName.includes('reasoning')) return PROMPT_VERSIONS.reasoning;
  return PROMPT_VERSIONS.entityExtraction;
}

function getSchemaVersionForAgent(agentName: string): string {
  const normalizedName = agentName.toLowerCase();
  if (normalizedName.includes('ingestion')) return SCHEMA_VERSIONS.ingestion;
  if (normalizedName.includes('entity')) return SCHEMA_VERSIONS.entityExtraction;
  if (normalizedName.includes('relationship'))
    return SCHEMA_VERSIONS.relationshipExtraction;
  if (normalizedName.includes('validation')) return SCHEMA_VERSIONS.validation;
  if (normalizedName.includes('reasoning')) return SCHEMA_VERSIONS.insight;
  return SCHEMA_VERSIONS.entityExtraction;
}

type CacheProvider = 'gemini';

interface CacheOptions {
  input: unknown;
  promptVersion?: string;
  schemaVersion?: string;
  provider?: CacheProvider;
  modelOverride?: string;
  disableCache?: boolean;
  tenantId: string; // Required for multi-tenant cache isolation
  executionMode?: 'hosted' | 'byo_key'; // Execution mode for usage tracking
  userId?: string; // User ID for usage tracking
  jobId?: string; // Job ID for usage tracking
  apiKeyOverride?: string; // Optional API key override (for BYO key mode)
}

export async function runAgent<T>(
  agentName: string,
  systemPrompt: string,
  userMessage: string,
  schema: z.ZodType<T>,
  config: AgentConfig = AGENT_CONFIG,
  logger: Logger = defaultLogger,
  cacheOptions?: CacheOptions
): Promise<T> {
  // Determine API key based on execution mode
  let apiKey: string;
  if (cacheOptions?.apiKeyOverride) {
    // BYO key mode - use tenant's API key
    apiKey = cacheOptions.apiKeyOverride;
  } else {
    // Hosted mode - use platform API key
    apiKey = process.env.GOOGLE_API_KEY || '';
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is not set');
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = cacheOptions?.modelOverride || getModelForAgent(agentName);
  const provider: CacheProvider = cacheOptions?.provider || 'gemini';
  const model = genAI.getGenerativeModel({ model: modelName });

  let lastError: z.ZodError | null = null;
  let lastParseFailed = false;
  let retryMode: 'normal' | 'compact' | 'minimal' = 'normal';
  const isRelationshipExtraction = agentName.toLowerCase().includes('relationship');
  const cacheVersion = {
    prompt: cacheOptions?.promptVersion ?? getPromptVersionForAgent(agentName),
    schema: cacheOptions?.schemaVersion ?? getSchemaVersionForAgent(agentName),
  };

  let cacheHitEntry: CacheEntry<T> | null = null;
  if (cacheOptions && !cacheOptions.disableCache) {
    const { key } = buildCacheKey({
      agentName,
      model: modelName,
      provider,
      promptVersion: cacheVersion.prompt,
      schemaVersion: cacheVersion.schema,
      input: cacheOptions.input,
    });
    cacheHitEntry = await readCache<T>(key, cacheOptions.tenantId);
    if (cacheHitEntry) {
      logger.info(`[${agentName}] Cache hit`);
      return cacheHitEntry.value;
    }
  }

  function looksLikeCompleteJson(text: string): boolean {
    const trimmed = text.trim();
    return trimmed.endsWith('}') || trimmed.endsWith(']');
  }

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    const startedAt = Date.now();
    try {
      const modeLabel = retryMode !== 'normal' ? ` (${retryMode} mode)` : '';
      logger.info(
        `[${agentName}] Attempt ${attempt}/${config.maxRetries + 1}${modeLabel} (model: ${modelName}, maxOutputTokens: ${config.maxTokens}, timeoutMs: ${config.timeoutMs})`
      );

      let enhancedUserMessage = userMessage;
      
      if (isRelationshipExtraction && retryMode === 'compact') {
        enhancedUserMessage = `${userMessage}\n\nIMPORTANT: Omit evidence and provenance fields entirely. Return the same edges but only include {source_canonical_name, target_canonical_name, relationship_type, confidence}. Must be valid JSON and end with }.`;
      } else if (isRelationshipExtraction && retryMode === 'minimal') {
        enhancedUserMessage = `${userMessage}\n\nIMPORTANT: Return at most 8 edges. Only include {source_canonical_name, target_canonical_name, relationship_type, confidence}. No evidence, no provenance, no extra fields. Must be valid JSON and end with }.`;
      } else if (lastParseFailed && attempt > 1 && !isRelationshipExtraction) {
        enhancedUserMessage = `${userMessage}\n\nPrevious response could not be parsed (likely truncation or invalid JSON). Return valid JSON only. You may omit or truncate evidence fields if needed, but keep all required structure.`;
      }
      
      if (attempt > 1 && lastError && retryMode === 'normal') {
        const errorFeedback = formatValidationErrors(lastError);
        enhancedUserMessage = `${enhancedUserMessage}\n\nPrevious validation errors:\n${errorFeedback}\n\nPlease fix these errors and return valid JSON.`;
      }

      const fullPrompt = `${systemPrompt}\n\nUser input:\n${enhancedUserMessage}`;

      const jsonSchema = zodToJsonSchema(schema as any, { target: 'openApi3' });
      
      const cleanSchema = (obj: any, path: string = ''): any => {
        if (Array.isArray(obj)) {
          return obj.map((item, idx) => cleanSchema(item, `${path}[${idx}]`));
        }
        if (obj && typeof obj === 'object') {
          const cleaned: any = {};
          for (const [key, value] of Object.entries(obj)) {
            if (key === 'additionalProperties') {
              continue;
            }
            const currentPath = path ? `${path}.${key}` : key;
            cleaned[key] = cleanSchema(value, currentPath);
          }
          if (obj.type === 'object' && (!obj.properties || Object.keys(obj.properties || {}).length === 0)) {
            if (path.includes('metadata')) {
              delete cleaned.type;
              delete cleaned.properties;
            } else {
              cleaned.type = 'string';
              delete cleaned.properties;
            }
          }
          return cleaned;
        }
        return obj;
      };

      const cleanedJsonSchema = cleanSchema(jsonSchema);

      const response = await limit('gemini_llm', async () => {
        const apiCall = model.generateContent({
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: 0.0,
            responseMimeType: 'application/json',
            responseSchema: cleanedJsonSchema as any,
          },
        });

        let timeoutHandle: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<Awaited<ReturnType<typeof model.generateContent>>>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new TimeoutError(agentName, config.timeoutMs));
          }, config.timeoutMs);
        });

        try {
          const result = await Promise.race([apiCall, timeoutPromise]);
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          return result;
        } catch (error) {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          // TimeoutError is already the right type, just re-throw
          if (error instanceof TimeoutError) {
            throw error;
          }
          throw error;
        }
      });

      const responseText = response.response.text();

      if (!responseText) {
        throw new Error('No text content in API response');
      }

      logger.info(`[${agentName}] Response length: ${responseText.length} chars`);

      const isTruncated = !looksLikeCompleteJson(responseText);
      if (isTruncated) {
        logger.warn(`[${agentName}] Response appears truncated - does not end with } or ]`);
        if (isRelationshipExtraction && attempt < config.maxRetries + 1) {
          if (retryMode === 'normal') {
            retryMode = 'compact';
            logger.info(`[${agentName}] Switching to compact mode for next retry`);
          } else if (retryMode === 'compact') {
            retryMode = 'minimal';
            logger.info(`[${agentName}] Switching to minimal mode for next retry`);
          }
        }
        if (attempt === config.maxRetries + 1) {
          logger.warn(`[${agentName}] Truncated response (first 1000 chars):`, {
            preview: responseText.substring(0, 1000),
          });
        }
      }

      let jsonData: unknown;
      try {
        jsonData = JSON.parse(responseText);
        lastParseFailed = false;
      } catch (parseError) {
        lastParseFailed = true;
        
        if (isRelationshipExtraction && attempt < config.maxRetries + 1) {
          if (retryMode === 'normal') {
            retryMode = 'compact';
            logger.warn(`[${agentName}] Parse failed, switching to compact mode for retry`);
          } else if (retryMode === 'compact') {
            retryMode = 'minimal';
            logger.warn(`[${agentName}] Parse failed in compact mode, switching to minimal mode for retry`);
          }
          
          logger.warn(`[${agentName}] JSON parse error (retryable for RelationshipExtraction):`, {
            error: parseError instanceof Error ? parseError.message : String(parseError),
            attempt,
          });
          continue;
        }
        
        if (attempt === config.maxRetries + 1) {
          const fullResponse = responseText.length > 2000 
            ? responseText.substring(0, 2000) + '...' 
            : responseText;
          logger.warn(`[${agentName}] Raw response:`, { fullResponse });
        }
        throw new Error(
          `Failed to parse JSON from response: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        );
      }

      const validationResult = schema.safeParse(jsonData);

      if (validationResult.success) {
        const modeNote = retryMode !== 'normal' ? ` (${retryMode} mode)` : '';
        logger.info(`[${agentName}] Success on attempt ${attempt}${modeNote}`);
        const durationMs = Date.now() - startedAt;

        const usageMetadata = (response as any)?.response?.usageMetadata;
        const inputTokens = usageMetadata?.promptTokenCount || 0;
        const outputTokens = usageMetadata?.candidatesTokenCount || usageMetadata?.totalTokenCount - inputTokens || 0;

        if (cacheOptions && cacheOptions.tenantId) {
          try {
            const usageTracking = createUsageTrackingService();
            const executionMode = cacheOptions.executionMode || 'hosted';
            const pipelineStage = agentName.toLowerCase().replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
            
            await usageTracking.logLLMUsage({
              tenant_id: cacheOptions.tenantId,
              user_id: cacheOptions.userId,
              pipeline_stage: pipelineStage,
              agent_name: agentName,
              model: modelName,
              provider,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              execution_mode: executionMode,
              job_id: cacheOptions.jobId,
              metadata: {
                attempt,
                retry_mode: retryMode,
                duration_ms: durationMs,
              },
            });
          } catch (usageError) {
            logger.warn(`[${agentName}] Failed to log usage: ${usageError instanceof Error ? usageError.message : String(usageError)}`);
          }
        }

        if (cacheOptions && !cacheOptions.disableCache && retryMode === 'normal') {
          const { key, inputHash } = buildCacheKey({
            agentName,
            model: modelName,
            provider,
            promptVersion: cacheVersion.prompt,
            schemaVersion: cacheVersion.schema,
            input: cacheOptions.input,
          });

          const finishReason =
            (response as any)?.response?.candidates?.[0]?.finishReason ??
            (response as any)?.response?.promptFeedback?.blockReason;

          const entry = buildCacheEntry(
            {
              agentName,
              promptVersion: cacheVersion.prompt,
              schemaVersion: cacheVersion.schema,
              provider,
              model: modelName,
              inputHash,
              durationMs,
              finishReason: finishReason ?? undefined,
            },
            validationResult.data
          );

          await writeCache(key, entry, cacheOptions.tenantId);
          logger.info(`[${agentName}] Cached result`);
        }

        return validationResult.data;
      } else {
        lastError = validationResult.error;
        logger.warn(`[${agentName}] Schema validation failed`, {
          attempt,
          errors: validationResult.error.issues,
        });

        if (attempt === config.maxRetries + 1) {
          throw new SchemaValidationError(
            agentName,
            validationResult.error,
            attempt
          );
        }

        continue;
      }
    } catch (error) {
      // Handle timeout errors - check both the error message and the error type
      if (
        error instanceof Error &&
        (error.message.includes('timed out') || error.message.includes('Operation timed out'))
      ) {
        logger.warn(`[${agentName}] Timeout detected, converting to TimeoutError`);
        throw new TimeoutError(agentName, config.timeoutMs);
      }

      if (error instanceof SchemaValidationError) {
        throw error;
      }
      
      if (error instanceof TimeoutError) {
        throw error;
      }

      const isParseError = error instanceof Error && error.message.includes('Failed to parse JSON');
      
      if (isParseError && isRelationshipExtraction && attempt < config.maxRetries + 1) {
        if (retryMode === 'normal') {
          retryMode = 'compact';
          logger.warn(`[${agentName}] Parse error, switching to compact mode for retry`);
        } else if (retryMode === 'compact') {
          retryMode = 'minimal';
          logger.warn(`[${agentName}] Parse error in compact mode, switching to minimal mode for retry`);
        }
        logger.warn(`[${agentName}] Error on attempt ${attempt} (will retry)`, {
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (attempt === config.maxRetries + 1) {
        throw new AgentExecutionError(
          agentName,
          error instanceof Error ? error : new Error(String(error))
        );
      }

      logger.warn(`[${agentName}] Error on attempt ${attempt}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      continue;
    }
  }

  throw new Error(`Unexpected state in runAgent for ${agentName}`);
}


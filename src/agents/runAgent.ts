import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AGENT_CONFIG, AGENT_MODELS, AgentConfig } from './config';
import {
  TimeoutError,
  SchemaValidationError,
  AgentExecutionError,
} from './errors';

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

function createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
  return new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

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

export async function runAgent<T>(
  agentName: string,
  systemPrompt: string,
  userMessage: string,
  schema: z.ZodType<T>,
  config: AgentConfig = AGENT_CONFIG,
  logger: Logger = defaultLogger
): Promise<T> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = getModelForAgent(agentName);
  const model = genAI.getGenerativeModel({ model: modelName });

  let lastError: z.ZodError | null = null;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      logger.info(
        `[${agentName}] Attempt ${attempt}/${config.maxRetries + 1} (model: ${modelName}, maxOutputTokens: ${config.maxTokens}, timeoutMs: ${config.timeoutMs})`
      );

      let enhancedUserMessage = userMessage;
      if (attempt > 1 && lastError) {
        const errorFeedback = formatValidationErrors(lastError);
        enhancedUserMessage = `${userMessage}\n\nPrevious validation errors:\n${errorFeedback}\n\nPlease fix these errors and return valid JSON.`;
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

      const apiCall = model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: config.maxTokens,
          temperature: 0.0,
          responseMimeType: 'application/json',
          responseSchema: cleanedJsonSchema as any,
        },
      });

      const response = await Promise.race([
        apiCall,
        createTimeoutPromise<Awaited<ReturnType<typeof model.generateContent>>>(
          config.timeoutMs
        ),
      ]);

      const responseText = response.response.text();

      if (!responseText) {
        throw new Error('No text content in API response');
      }

      logger.info(`[${agentName}] Response length: ${responseText.length} chars`);

      if (!responseText.trim().endsWith('}')) {
        logger.warn(`[${agentName}] Response may be truncated - does not end with '}'`);
        if (attempt === config.maxRetries + 1) {
          logger.warn(`[${agentName}] Truncated response (first 1000 chars):`, {
            preview: responseText.substring(0, 1000),
          });
        }
      }

      let jsonData: unknown;
      try {
        jsonData = JSON.parse(responseText);
      } catch (parseError) {
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
        logger.info(`[${agentName}] Success on attempt ${attempt}`);
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
      if (
        error instanceof Error &&
        error.message.includes('timed out')
      ) {
        throw new TimeoutError(agentName, config.timeoutMs);
      }

      if (error instanceof SchemaValidationError) {
        throw error;
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


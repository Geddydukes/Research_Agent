import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createDatabaseClient } from '../../db/client';
import { requireTenant, requireTenantWriteAccess, requireUser } from '../middleware';
import { encrypt } from '../../services/encryption';
import { EmbeddingsClient } from '../../embeddings/embed';

interface SettingsUpdateBody {
  execution_mode?: 'hosted' | 'byo_key';
  api_key?: string;
  clear_api_key?: boolean;
  default_model_choices?: Record<string, unknown>;
  max_papers_per_run?: number | null;
  max_reasoning_depth?: number;
  semantic_gating_threshold?: number;
  allow_speculative_edges?: boolean;
  enabled_relationship_types?: string[];
  monthly_cost_limit?: number | null;
  monthly_token_limit?: number | null;
  daily_cost_limit?: number | null;
  daily_token_limit?: number | null;
}

export function registerSettingsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/settings',
    { preHandler: [requireUser, requireTenant] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = request.tenantId!;
      const db = createDatabaseClient(tenantId);
      const settings = await db.getTenantSettings();

      if (!settings) {
        return reply.status(404).send({ error: 'Tenant settings not found' });
      }

      const { api_key_encrypted, ...rest } = settings;
      reply.send({
        data: {
          ...rest,
          api_key_configured: Boolean(api_key_encrypted),
        },
      });
    }
  );

  fastify.put(
    '/api/settings',
    { preHandler: [requireUser, requireTenant, requireTenantWriteAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = request.tenantId!;
      const db = createDatabaseClient(tenantId);
      const body = ((request as any).body || {}) as SettingsUpdateBody;

      const update: Record<string, unknown> = {};
      const assignIfDefined = (key: string, value: unknown) => {
        if (value !== undefined) {
          update[key] = value;
        }
      };

      assignIfDefined('execution_mode', body.execution_mode);
      assignIfDefined('default_model_choices', body.default_model_choices);
      assignIfDefined('max_papers_per_run', body.max_papers_per_run);
      assignIfDefined('max_reasoning_depth', body.max_reasoning_depth);
      assignIfDefined('semantic_gating_threshold', body.semantic_gating_threshold);
      assignIfDefined('allow_speculative_edges', body.allow_speculative_edges);
      assignIfDefined('enabled_relationship_types', body.enabled_relationship_types);
      assignIfDefined('monthly_cost_limit', body.monthly_cost_limit);
      assignIfDefined('monthly_token_limit', body.monthly_token_limit);
      assignIfDefined('daily_cost_limit', body.daily_cost_limit);
      assignIfDefined('daily_token_limit', body.daily_token_limit);

      if (body.clear_api_key) {
        update.api_key_encrypted = null;
      } else if (body.api_key) {
        update.api_key_encrypted = await encrypt(body.api_key);
      }

      await db.updateTenantSettings(update);
      const settings = await db.getTenantSettings();

      if (!settings) {
        return reply.status(404).send({ error: 'Tenant settings not found' });
      }

      const { api_key_encrypted, ...rest } = settings;
      reply.send({
        data: {
          ...rest,
          api_key_configured: Boolean(api_key_encrypted),
        },
      });
    }
  );

  fastify.post(
    '/api/settings/validate-key',
    { preHandler: [requireUser, requireTenant, requireTenantWriteAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = request.tenantId!;
      const apiKey = (request as any).body?.api_key;

      if (!apiKey) {
        return reply.status(400).send({ error: 'api_key is required' });
      }

      try {
        const client = new EmbeddingsClient(apiKey);
        await client.embedTexts(['Health check'], tenantId);
        reply.send({ data: { valid: true } });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid API key';
        reply.status(400).send({ data: { valid: false, message } });
      }
    }
  );
}

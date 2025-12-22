import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUsageTrackingService } from '../../services/usageTracking';
import { createUsageLimitsService } from '../../services/usageLimits';
import { createDatabaseClient } from '../../db/client';
import { requireTenant } from '../middleware';

interface UsageStatsQuery {
  start_date?: string;
  end_date?: string;
  pipeline_stage?: string;
  page?: number;
  limit?: number;
}

export function registerUsageRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/usage/stats',
    {
      preHandler: requireTenant,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID is required' });
      }

      const { start_date, end_date } = request.query as UsageStatsQuery;

      const usageTracking = createUsageTrackingService();
      const stats = await usageTracking.getUsageStats(
        tenantId,
        start_date ? new Date(start_date) : undefined,
        end_date ? new Date(end_date) : undefined
      );

      reply.send({
        data: {
          stats,
          period: {
            start: start_date || null,
            end: end_date || null,
          },
        },
      });
    }
  );

  fastify.get(
    '/api/usage/events',
    {
      preHandler: requireTenant,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID is required' });
      }

      const { start_date, end_date, pipeline_stage, page = 1, limit = 50 } = request.query as UsageStatsQuery;

      const usageTracking = createUsageTrackingService();
      const result = await usageTracking.getUsageEvents(tenantId, {
        page: Number(page),
        limit: Math.min(Number(limit), 100),
        startDate: start_date ? new Date(start_date) : undefined,
        endDate: end_date ? new Date(end_date) : undefined,
        pipeline_stage,
      });

      reply.send({
        data: result.data,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: result.count,
          totalPages: Math.ceil(result.count / Number(limit)),
        },
      });
    }
  );

  fastify.get(
    '/api/usage/limits',
    {
      preHandler: requireTenant,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID is required' });
      }

      const { period = 'monthly' } = request.query as { period?: 'daily' | 'monthly' };

      const db = createDatabaseClient(tenantId);
      const tenantSettings = await db.getTenantSettings();
      if (!tenantSettings) {
        return reply.status(404).send({ error: 'Tenant settings not found' });
      }

      const limitsService = createUsageLimitsService();
      const result = await limitsService.checkLimits(tenantId, tenantSettings, period);

      reply.send({
        data: {
          period,
          ...result,
        },
      });
    }
  );

  fastify.get(
    '/api/usage/summary',
    {
      preHandler: requireTenant,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID is required' });
      }

      const db = createDatabaseClient(tenantId);
      const tenantSettings = await db.getTenantSettings();
      if (!tenantSettings) {
        return reply.status(404).send({ error: 'Tenant settings not found' });
      }

      const limitsService = createUsageLimitsService();
      const summary = await limitsService.getUsageSummary(tenantId, tenantSettings);

      reply.send({
        data: summary,
      });
    }
  );
}


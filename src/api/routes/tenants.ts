import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireUser } from '../middleware';
import { ensureTenantForUser, getTenantsForUser } from '../services/tenantService';

export function registerTenantsRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/tenants/ensure',
    {
      preHandler: requireUser,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId;
      const userEmail = (request as any).userEmail as string | undefined;

      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const membership = await ensureTenantForUser(userId, userEmail);
      reply.send({
        data: {
          tenant: membership.tenant,
          role: membership.role,
        },
      });
    }
  );

  fastify.get(
    '/api/tenants',
    {
      preHandler: requireUser,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const tenants = await getTenantsForUser(userId);
      reply.send({
        data: tenants,
      });
    }
  );
}

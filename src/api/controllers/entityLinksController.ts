import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createDatabaseClient } from '../../db/client';
import { createError } from '../middleware/errorHandler';
import { requireTenantAuth } from '../middleware/tenantAuth';

export class EntityLinksController {
  constructor(private server: FastifyInstance) {}

  async getEntityLinks(request: FastifyRequest, reply: FastifyReply) {
    await requireTenantAuth(request, reply);
    const tenantId = (request as any).tenantId;
    const db = createDatabaseClient(tenantId);

    const query = request.query as {
      nodeId?: string;
      canonicalNodeId?: string;
      status?: 'proposed' | 'approved' | 'rejected';
      linkType?: 'alias_of' | 'same_as_candidate';
    };

    const links = await db.getEntityLinks({
      nodeId: query.nodeId ? parseInt(query.nodeId) : undefined,
      canonicalNodeId: query.canonicalNodeId ? parseInt(query.canonicalNodeId) : undefined,
      status: query.status,
      linkType: query.linkType,
    });

    return reply.send({ data: links });
  }

  async getProposals(request: FastifyRequest, reply: FastifyReply) {
    await requireTenantAuth(request, reply);
    const tenantId = (request as any).tenantId;
    const db = createDatabaseClient(tenantId);

    const proposals = await db.getEntityLinks({
      status: 'proposed',
    });

    // Enrich with node information
    const nodeIds = new Set<number>();
    proposals.forEach(p => {
      nodeIds.add(p.node_id);
      nodeIds.add(p.canonical_node_id);
    });

    const { data: nodes } = await db.client
      .from('nodes')
      .select('id, canonical_name, type, metadata')
      .in('id', Array.from(nodeIds))
      .eq('tenant_id', tenantId);

    const nodeMap = new Map((nodes || []).map((n: any) => [n.id, n]));

    const enriched = proposals.map(proposal => ({
      ...proposal,
      node: nodeMap.get(proposal.node_id),
      canonical_node: nodeMap.get(proposal.canonical_node_id),
    }));

    return reply.send({ data: enriched });
  }

  async updateLinkStatus(request: FastifyRequest, reply: FastifyReply) {
    await requireTenantAuth(request, reply);
    const tenantId = (request as any).tenantId;
    const db = createDatabaseClient(tenantId);

    const params = request.params as { linkId: string };
    const body = request.body as { status: 'approved' | 'rejected'; reviewedBy?: string };

    if (!body.status || !['approved', 'rejected'].includes(body.status)) {
      throw createError('Invalid status', 400, 'INVALID_STATUS');
    }

    const link = await db.updateEntityLinkStatus(
      parseInt(params.linkId),
      body.status,
      body.reviewedBy
    );

    return reply.send({ data: link });
  }

  async bulkUpdate(request: FastifyRequest, reply: FastifyReply) {
    await requireTenantAuth(request, reply);
    const tenantId = (request as any).tenantId;
    const db = createDatabaseClient(tenantId);

    const body = request.body as {
      linkIds: number[];
      status: 'approved' | 'rejected';
      reviewedBy?: string;
    };

    if (!body.linkIds || !Array.isArray(body.linkIds) || body.linkIds.length === 0) {
      throw createError('linkIds array required', 400, 'INVALID_INPUT');
    }

    if (!body.status || !['approved', 'rejected'].includes(body.status)) {
      throw createError('Invalid status', 400, 'INVALID_STATUS');
    }

    const results = await Promise.allSettled(
      body.linkIds.map(linkId =>
        db.updateEntityLinkStatus(linkId, body.status, body.reviewedBy)
      )
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return reply.send({
      data: {
        total: body.linkIds.length,
        succeeded,
        failed,
      },
    });
  }

  async getEntityAliases(request: FastifyRequest, reply: FastifyReply) {
    await requireTenantAuth(request, reply);
    const tenantId = (request as any).tenantId;
    const db = createDatabaseClient(tenantId);

    const params = request.params as { nodeId: string };
    const nodeId = parseInt(params.nodeId);

    if (isNaN(nodeId)) {
      throw createError('Invalid nodeId', 400, 'INVALID_INPUT');
    }

    const aliases = await db.getEntityAliases(nodeId);

    return reply.send({ data: aliases });
  }
}

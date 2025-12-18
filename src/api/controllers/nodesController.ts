import type { FastifyRequest, FastifyReply } from 'fastify';
import { NodesService } from '../services/nodesService';
import { createError } from '../middleware/errorHandler';

interface NodeParams {
  nodeId: string;
}

export class NodesController {
  constructor(private nodesService: NodesService) {}

  async getPapers(
    request: FastifyRequest<{ Params: NodeParams }>,
    reply: FastifyReply
  ) {
    const { nodeId } = request.params;
    const nodeIdNum = parseInt(nodeId, 10);

    if (isNaN(nodeIdNum)) {
      throw createError('Invalid nodeId', 400);
    }

    const papers = await this.nodesService.getPapersForNode(nodeIdNum);
    reply.send({ data: papers });
  }
}

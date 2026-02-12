import type { FastifyRequest, FastifyReply } from 'fastify';
import { GraphService } from '../services/graphService';
import { createError } from '../middleware/errorHandler';
import type {
  GraphNeighborhoodParams,
  GraphViewportParams,
  GraphSubgraphParams,
} from '../types/api';

interface NeighborhoodQuerystring {
  nodeId?: string;
  paperId?: string;
  depth?: string;
  maxNodes?: string;
  maxEdges?: string;
}

interface ViewportQuerystring {
  paperId?: string;
  depth?: string;
  maxNodes?: string;
}

interface SubgraphBody {
  paperIds: string[];
}

export class GraphController {
  constructor(private graphService: GraphService) {}

  async getNeighborhood(
    request: FastifyRequest<{ Querystring: NeighborhoodQuerystring }>,
    reply: FastifyReply
  ) {
    let depth = request.query.depth ? parseInt(request.query.depth, 10) : undefined;
    if (depth !== undefined) {
      if (isNaN(depth) || depth < 1) depth = 1;
      if (depth > 20) depth = 20;
    }
    const params: GraphNeighborhoodParams = {
      nodeId: request.query.nodeId
        ? parseInt(request.query.nodeId, 10)
        : undefined,
      paperId: request.query.paperId,
      depth,
      maxNodes: request.query.maxNodes
        ? parseInt(request.query.maxNodes, 10)
        : undefined,
      maxEdges: request.query.maxEdges
        ? parseInt(request.query.maxEdges, 10)
        : undefined,
    };

    const result = await this.graphService.getNeighborhood(params);
    reply.send({ data: result });
  }

  async getViewport(
    request: FastifyRequest<{ Querystring: ViewportQuerystring }>,
    reply: FastifyReply
  ) {
    let depth = request.query.depth ? parseInt(request.query.depth, 10) : undefined;
    if (depth !== undefined) {
      if (isNaN(depth) || depth < 1) depth = 1;
      if (depth > 20) depth = 20;
    }
    const params: GraphViewportParams = {
      paperId: request.query.paperId,
      depth,
      maxNodes: request.query.maxNodes
        ? parseInt(request.query.maxNodes, 10)
        : undefined,
    };

    const result = await this.graphService.getViewport(params);
    reply.send({ data: result });
  }

  async getSubgraph(
    request: FastifyRequest<{ Body: SubgraphBody }>,
    reply: FastifyReply
  ) {
    const { paperIds } = request.body;

    if (!Array.isArray(paperIds) || paperIds.length === 0) {
      throw createError('paperIds array is required', 400);
    }

    const params: GraphSubgraphParams = { paperIds };
    const result = await this.graphService.getSubgraph(params);
    reply.send({ data: result });
  }

  async getFullGraph(
    request: FastifyRequest<{ Querystring: { maxNodes?: string } }>,
    reply: FastifyReply
  ) {
    // Debug endpoint with hard cap
    const maxNodes = request.query.maxNodes
      ? parseInt(request.query.maxNodes, 10)
      : 1000;

    if (maxNodes > 5000) {
      throw createError('maxNodes cannot exceed 5000', 400);
    }

    const result = await this.graphService.getFullGraph(maxNodes);
    reply.send({ data: result });
  }

  async getReviewGraph(
    _request: FastifyRequest,
    reply: FastifyReply
  ) {
    const result = await this.graphService.getReviewGraph();
    reply.send({ data: result });
  }
}

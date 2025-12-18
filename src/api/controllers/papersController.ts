import type { FastifyRequest, FastifyReply } from 'fastify';
import { PapersService } from '../services/papersService';
import { createError } from '../middleware/errorHandler';
import type { PaginationParams } from '../types/api';

interface PapersQuerystring {
  page?: string;
  limit?: string;
}

interface PaperParams {
  paperId: string;
}

export class PapersController {
  constructor(private papersService: PapersService) {}

  async getAll(
    request: FastifyRequest<{ Querystring: PapersQuerystring }>,
    reply: FastifyReply
  ) {
    const params: PaginationParams = {
      page: request.query.page ? parseInt(request.query.page, 10) : undefined,
      limit: request.query.limit
        ? parseInt(request.query.limit, 10)
        : undefined,
    };

    const result = await this.papersService.getAllPapers(params);
    reply.send(result);
  }

  async getById(
    request: FastifyRequest<{ Params: PaperParams }>,
    reply: FastifyReply
  ) {
    const { paperId } = request.params;
    const paper = await this.papersService.getPaperById(paperId);

    if (!paper) {
      throw createError('Paper not found', 404, 'PAPER_NOT_FOUND');
    }

    reply.send({ data: paper });
  }

  async getSections(
    request: FastifyRequest<{ Params: PaperParams }>,
    reply: FastifyReply
  ) {
    const { paperId } = request.params;
    const sections = await this.papersService.getPaperSections(paperId);
    reply.send({ data: sections });
  }

  async getNodes(
    request: FastifyRequest<{ Params: PaperParams }>,
    reply: FastifyReply
  ) {
    const { paperId } = request.params;
    const nodes = await this.papersService.getPaperNodes(paperId);
    reply.send({ data: nodes });
  }

  async getEdges(
    request: FastifyRequest<{ Params: PaperParams }>,
    reply: FastifyReply
  ) {
    const { paperId } = request.params;
    const edges = await this.papersService.getPaperEdges(paperId);
    reply.send({ data: edges });
  }
}

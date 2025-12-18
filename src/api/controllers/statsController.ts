import type { FastifyRequest, FastifyReply } from 'fastify';
import { StatsService } from '../services/statsService';

interface PaperStatsParams {
  paperId: string;
}

export class StatsController {
  constructor(private statsService: StatsService) {}

  async getStats(_request: FastifyRequest, reply: FastifyReply) {
    const stats = await this.statsService.getStats();
    reply.send({ data: stats });
  }

  async getPaperStats(
    request: FastifyRequest<{ Params: PaperStatsParams }>,
    reply: FastifyReply
  ) {
    const { paperId } = request.params;
    const stats = await this.statsService.getPaperStats(paperId);
    reply.send({ data: stats });
  }
}

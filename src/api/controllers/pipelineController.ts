import type { FastifyRequest, FastifyReply } from 'fastify';
import { runPipeline } from '../../pipeline/runPipeline';
import { createDatabaseClient } from '../../db/client';
import { createError } from '../middleware/errorHandler';
import type { PaperInput } from '../../pipeline/types';
import { v4 as uuidv4 } from 'uuid';

// Simple in-memory job store (in production, use a proper queue/DB)
interface PipelineJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  paperId?: string;
  result?: any;
  error?: string;
  createdAt: Date;
}

const jobs = new Map<string, PipelineJob>();

interface ProcessBody {
  paper_id: string;
  title?: string;
  raw_text: string;
  metadata?: Record<string, unknown>;
}

interface JobParams {
  jobId: string;
}

export class PipelineController {
  async process(
    request: FastifyRequest<{ Body: ProcessBody }>,
    reply: FastifyReply
  ) {
    const { paper_id, title, raw_text, metadata } = request.body;

    if (!paper_id || !raw_text) {
      throw createError('paper_id and raw_text are required', 400);
    }

    const jobId = uuidv4();
    const job: PipelineJob = {
      jobId,
      status: 'pending',
      paperId: paper_id,
      createdAt: new Date(),
    };
    jobs.set(jobId, job);

    // Process asynchronously
    this.processJob(jobId, { paper_id, title, raw_text, metadata }).catch(
      (error) => {
        const job = jobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = error.message;
        }
      }
    );

    reply.status(202).send({
      data: {
        jobId,
        status: 'pending',
        message: 'Paper processing started',
      },
    });
  }

  async getStatus(
    request: FastifyRequest<{ Params: JobParams }>,
    reply: FastifyReply
  ) {
    const { jobId } = request.params;
    const job = jobs.get(jobId);

    if (!job) {
      throw createError('Job not found', 404, 'JOB_NOT_FOUND');
    }

    reply.send({ data: job });
  }

  private async processJob(jobId: string, input: PaperInput) {
    const job = jobs.get(jobId);
    if (!job) return;

    job.status = 'processing';

    try {
      const db = createDatabaseClient();
      const result = await runPipeline(input, db);

      job.status = result.success ? 'completed' : 'failed';
      job.result = result;
      if (!result.success) {
        job.error = result.error;
      }
    } catch (error) {
      job.status = 'failed';
      job.error =
        error instanceof Error ? error.message : 'Unknown error occurred';
    }
  }
}

import type { FastifyRequest, FastifyReply } from 'fastify';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { runPipeline } from '../../pipeline/runPipeline';
import { createDatabaseClient } from '../../db/client';
import { createError } from '../middleware/errorHandler';
import type { PaperInput } from '../../pipeline/types';
import { parsePaperBuffer } from '../../utils/paperParser';
import path from 'path';
import { createUsageLimitsService } from '../../services/usageLimits';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.PIPELINE_RATE_LIMIT_PER_MINUTE || '10');
const URL_FETCH_TIMEOUT_MS = Number(process.env.URL_FETCH_TIMEOUT_MS || '15000');
const URL_FETCH_MAX_BYTES = Number(process.env.URL_FETCH_MAX_BYTES || String(10 * 1024 * 1024));
const URL_FETCH_MAX_REDIRECTS = Number(process.env.URL_FETCH_MAX_REDIRECTS || '3');
const MAX_REDIRECTS = Math.max(0, URL_FETCH_MAX_REDIRECTS);

const DEMO_ACCOUNT_EMAILS = ['demo@demo.com', 'livedemo@demo.com'];

function blockDemoRun(request: FastifyRequest): void {
  const email = (request as any).userEmail as string | undefined;
  const normalized = email?.toLowerCase();
  if (normalized && DEMO_ACCOUNT_EMAILS.some((e) => e.toLowerCase() === normalized)) {
    throw createError(
      'Run is disabled for the demo account. Sign up for a full account to process papers.',
      403,
      'DEMO_RUN_DISABLED'
    );
  }
}

interface ProcessBody {
  paper_id: string;
  title?: string;
  raw_text: string;
  metadata?: Record<string, unknown>;
  reasoning_depth?: number;
}

interface JobParams {
  jobId: string;
}

interface JobListQuery {
  page?: string;
  limit?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}

interface FileProcessBody {
  file_name: string;
  file_base64: string;
  reasoning_depth?: number;
}

interface UrlProcessBody {
  url: string;
  paper_id?: string;
  title?: string;
  reasoning_depth?: number;
}

export class PipelineController {
  async process(
    request: FastifyRequest<{ Body: ProcessBody }>,
    reply: FastifyReply
  ) {
    const { paper_id, title, raw_text, metadata, reasoning_depth } = request.body;

    if (!paper_id || !raw_text) {
      throw createError('paper_id and raw_text are required', 400);
    }

    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createError('Tenant ID is required', 400, 'TENANT_REQUIRED');
    }

    blockDemoRun(request);
    await this.enforceRateLimit(tenantId);
    await this.enforceUsageLimits(tenantId);

    const job = await this.createJob(tenantId, paper_id);

    if (process.env.NODE_ENV !== 'test') {
      // Process asynchronously
      this.processJob(job.id, { paper_id, title, raw_text, metadata }, tenantId, reasoning_depth).catch(
        async (error) => {
          await this.failJob(tenantId, job.id, error);
        }
      );
    }

    reply.status(202).send({
      data: {
        jobId: job.id,
        status: 'pending',
        message: 'Paper processing started',
      },
    });
  }

  async processFile(
    request: FastifyRequest<{ Body: FileProcessBody }>,
    reply: FastifyReply
  ) {
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createError('Tenant ID is required', 400, 'TENANT_REQUIRED');
    }

    blockDemoRun(request);
    await this.enforceRateLimit(tenantId);
    await this.enforceUsageLimits(tenantId);

    const { file_name, file_base64, reasoning_depth } = request.body;
    if (!file_name || !file_base64) {
      throw createError('file_name and file_base64 are required', 400);
    }

    const ext = path.extname(file_name) || '.pdf';
    const buffer = Buffer.from(file_base64, 'base64');
    const paperInput = await parsePaperBuffer(buffer, ext, path.basename(file_name, ext));

    const job = await this.createJob(tenantId, paperInput.paper_id);
    if (process.env.NODE_ENV !== 'test') {
      this.processJob(job.id, paperInput, tenantId, reasoning_depth).catch(
        async (error) => {
          await this.failJob(tenantId, job.id, error);
        }
      );
    }

    reply.status(202).send({
      data: {
        jobId: job.id,
        status: 'pending',
        message: 'File processing started',
      },
    });
  }

  async processUrl(
    request: FastifyRequest<{ Body: UrlProcessBody }>,
    reply: FastifyReply
  ) {
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createError('Tenant ID is required', 400, 'TENANT_REQUIRED');
    }

    blockDemoRun(request);
    await this.enforceRateLimit(tenantId);
    await this.enforceUsageLimits(tenantId);

    const { url, paper_id, title, reasoning_depth } = request.body;
    if (!url) {
      throw createError('url is required', 400);
    }

    const normalizedUrl = url.trim();
    const resolvedUrl = isArxivAbsUrl(normalizedUrl)
      ? toArxivPdfUrl(normalizedUrl)
      : normalizedUrl;
    const safeUrl = await sanitizeRemoteUrl(resolvedUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
    let response: Response;
    let fetchedUrl = safeUrl;
    try {
      const fetched = await fetchWithSafeRedirects(safeUrl, controller.signal);
      response = fetched.response;
      fetchedUrl = fetched.finalUrl;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw createError('URL fetch timed out', 408, 'URL_FETCH_TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw createError(`Failed to fetch URL: ${response.status}`, 400);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : NaN;
    if (!Number.isNaN(contentLength) && contentLength > URL_FETCH_MAX_BYTES) {
      throw createError('Remote file is too large', 413, 'URL_PAYLOAD_TOO_LARGE');
    }

    const buffer = await readResponseWithLimit(response, URL_FETCH_MAX_BYTES);
    let paperInput: PaperInput;

    if (isPdfContent(contentType, fetchedUrl)) {
      paperInput = await parsePaperBuffer(buffer, '.pdf', paper_id || 'remote_pdf');
    } else if (isJsonContent(contentType, fetchedUrl)) {
      paperInput = await parsePaperBuffer(buffer, '.json', paper_id || 'remote_json');
    } else if (isHtmlContent(contentType, fetchedUrl)) {
      const text = stripHtml(buffer.toString('utf-8'));
      if (!text.trim()) {
        throw createError('Empty HTML content after parsing', 400);
      }
      paperInput = {
        paper_id: paper_id || 'remote_html',
        title,
        raw_text: text,
        metadata: { source_url: normalizedUrl, resolved_url: fetchedUrl },
      };
    } else if (isPlainTextContent(contentType, fetchedUrl)) {
      const text = buffer.toString('utf-8');
      if (!text.trim()) {
        throw createError('Unsupported content type for URL ingestion', 400);
      }
      paperInput = {
        paper_id: paper_id || 'remote_text',
        title,
        raw_text: text,
        metadata: { source_url: normalizedUrl, resolved_url: fetchedUrl },
      };
    } else {
      throw createError('Unsupported content type for URL ingestion', 415, 'UNSUPPORTED_CONTENT_TYPE');
    }

    const job = await this.createJob(tenantId, paperInput.paper_id);
    if (process.env.NODE_ENV !== 'test') {
      this.processJob(job.id, paperInput, tenantId, reasoning_depth).catch(
        async (error) => {
          await this.failJob(tenantId, job.id, error);
        }
      );
    }

    reply.status(202).send({
      data: {
        jobId: job.id,
        status: 'pending',
        message: 'URL processing started',
      },
    });
  }

  async getStatus(
    request: FastifyRequest<{ Params: JobParams }>,
    reply: FastifyReply
  ) {
    const { jobId } = request.params;
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createError('Tenant ID is required', 400, 'TENANT_REQUIRED');
    }

    const db = createDatabaseClient(tenantId);
    const job = await db.getPipelineJob(jobId);

    if (!job) {
      throw createError('Job not found', 404, 'JOB_NOT_FOUND');
    }

    reply.send({
      data: {
        jobId: job.id,
        status: job.status,
        paperId: job.paper_id,
        result: job.result || undefined,
        error: job.error || undefined,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      },
    });
  }

  async list(
    request: FastifyRequest<{ Querystring: JobListQuery }>,
    reply: FastifyReply
  ) {
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createError('Tenant ID is required', 400, 'TENANT_REQUIRED');
    }

    const { page = '1', limit = '20', status } = request.query || {};
    const db = createDatabaseClient(tenantId);
    const result = await db.listPipelineJobs({
      page: Number(page),
      limit: Number(limit),
      status,
    });

    reply.send({
      data: result.data.map((job) => ({
        jobId: job.id,
        status: job.status,
        paperId: job.paper_id,
        result: job.result || undefined,
        error: job.error || undefined,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.count,
        totalPages: Math.ceil(result.count / Number(limit)),
      },
    });
  }

  private async processJob(jobId: string, input: PaperInput, tenantId: string, reasoningDepth?: number) {
    const db = createDatabaseClient(tenantId);
    await db.updatePipelineJob(jobId, {
      status: 'processing',
    });

    try {
      const result = await runPipeline(input, tenantId, db, undefined, {
        reasoningDepth,
        onProgress: async (stage) => {
          await db.updatePipelineJob(jobId, {
            status: 'processing',
            result: {
              progress: {
                stage,
                updated_at: new Date().toISOString(),
              },
            },
          });
        },
      });

      await db.updatePipelineJob(jobId, {
        status: result.success ? 'completed' : 'failed',
        result: result as any,
        error: result.success ? null : result.error || 'Pipeline failed',
      });
    } catch (error) {
      await db.updatePipelineJob(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }

  private async createJob(tenantId: string, paperId: string) {
    const db = createDatabaseClient(tenantId);
    return db.createPipelineJob({
      paper_id: paperId,
      status: 'pending',
    });
  }

  private async failJob(tenantId: string, jobId: string, error: unknown) {
    const db = createDatabaseClient(tenantId);
    await db.updatePipelineJob(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }

  private async enforceRateLimit(tenantId: string) {
    const db = createDatabaseClient(tenantId);
    const recentJobCount = await db.countPipelineJobsSince(RATE_LIMIT_WINDOW_MS);
    if (recentJobCount >= RATE_LIMIT_MAX) {
      throw createError('Rate limit exceeded', 429, 'RATE_LIMIT');
    }
  }

  private async enforceUsageLimits(tenantId: string) {
    const db = createDatabaseClient(tenantId);
    const settings = await db.getTenantSettings();
    if (!settings) return;

    const limitsService = createUsageLimitsService();
    const monthly = await limitsService.checkLimits(tenantId, settings, 'monthly');
    const daily = await limitsService.checkLimits(tenantId, settings, 'daily');
    if (!monthly.withinLimits || !daily.withinLimits) {
      const errors = [...monthly.errors, ...daily.errors].join('; ');
      throw createError(errors || 'Usage limits exceeded', 403, 'USAGE_LIMIT');
    }
  }
}

function isArxivAbsUrl(url: string) {
  return url.includes('arxiv.org/abs/');
}

function toArxivPdfUrl(url: string) {
  return url.replace('/abs/', '/pdf/') + '.pdf';
}

async function sanitizeRemoteUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw createError('Invalid URL', 400, 'INVALID_URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw createError('Only http/https URLs are allowed', 400, 'UNSUPPORTED_URL_PROTOCOL');
  }

  await assertPublicHost(parsed.hostname);
  return parsed.toString();
}

async function fetchWithSafeRedirects(
  startUrl: string,
  signal: AbortSignal
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = startUrl;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal,
    });

    if (isRedirectStatus(response.status)) {
      if (i >= MAX_REDIRECTS) {
        throw createError('Too many redirects', 400, 'URL_TOO_MANY_REDIRECTS');
      }

      const location = response.headers.get('location');
      if (!location) {
        throw createError('Redirect location is missing', 400, 'INVALID_REDIRECT');
      }

      currentUrl = await sanitizeRemoteUrl(new URL(location, currentUrl).toString());
      continue;
    }

    return { response, finalUrl: currentUrl };
  }

  throw createError('Too many redirects', 400, 'URL_TOO_MANY_REDIRECTS');
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const normalizedHost = hostname.trim().toLowerCase();
  if (
    normalizedHost === 'localhost' ||
    normalizedHost === '0.0.0.0' ||
    normalizedHost.endsWith('.local')
  ) {
    throw createError('Private network URLs are not allowed', 400, 'URL_PRIVATE_ADDRESS');
  }

  if (isIP(normalizedHost)) {
    if (isPrivateIpAddress(normalizedHost)) {
      throw createError('Private network URLs are not allowed', 400, 'URL_PRIVATE_ADDRESS');
    }
    return;
  }

  let resolved: Array<{ address: string }>;
  try {
    resolved = await lookup(normalizedHost, { all: true, verbatim: true });
  } catch {
    throw createError('Failed to resolve URL host', 400, 'URL_RESOLVE_FAILED');
  }

  if (resolved.length === 0) {
    throw createError('Failed to resolve URL host', 400, 'URL_RESOLVE_FAILED');
  }

  for (const record of resolved) {
    if (isPrivateIpAddress(record.address)) {
      throw createError('Private network URLs are not allowed', 400, 'URL_PRIVATE_ADDRESS');
    }
  }
}

function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized === '::1' || normalized === '::') {
    return true;
  }

  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpAddress(normalized.replace('::ffff:', ''));
  }

  if (normalized.includes(':')) {
    return (
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
  }

  const octets = normalized.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
    return true;
  }

  const [a, b] = octets;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function readResponseWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw createError('Remote file is too large', 413, 'URL_PAYLOAD_TOO_LARGE');
    }
    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw createError('Remote file is too large', 413, 'URL_PAYLOAD_TOO_LARGE');
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

function normalizedContentType(contentType: string): string {
  return contentType.split(';', 1)[0]?.trim().toLowerCase() || '';
}

function isPdfContent(contentType: string, url: string): boolean {
  const normalizedType = normalizedContentType(contentType);
  return normalizedType === 'application/pdf' || url.toLowerCase().endsWith('.pdf');
}

function isJsonContent(contentType: string, url: string): boolean {
  const normalizedType = normalizedContentType(contentType);
  return normalizedType === 'application/json' || normalizedType === 'text/json' || url.toLowerCase().endsWith('.json');
}

function isHtmlContent(contentType: string, url: string): boolean {
  const normalizedType = normalizedContentType(contentType);
  return (
    normalizedType === 'text/html' ||
    normalizedType === 'application/xhtml+xml' ||
    url.toLowerCase().endsWith('.html') ||
    url.toLowerCase().endsWith('.htm')
  );
}

function isPlainTextContent(contentType: string, url: string): boolean {
  const normalizedType = normalizedContentType(contentType);
  return normalizedType === 'text/plain' || url.toLowerCase().endsWith('.txt');
}

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

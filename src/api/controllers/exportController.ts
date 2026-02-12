import type { FastifyRequest, FastifyReply } from 'fastify';
import archiver from 'archiver';
import { createDatabaseClient } from '../../db/client';
import { ExportService } from '../services/exportService';
import { createError } from '../middleware/errorHandler';

type ExportFormat = 'graphml' | 'gexf' | 'csv-bundle' | 'json';

const VALID_FORMATS: ExportFormat[] = ['graphml', 'gexf', 'csv-bundle', 'json'];

function getFormat(request: FastifyRequest): ExportFormat {
  const format = (request.query as { format?: string }).format as string | undefined;
  if (!format || !VALID_FORMATS.includes(format as ExportFormat)) {
    throw createError(
      `format must be one of: ${VALID_FORMATS.join(', ')}`,
      400,
      'INVALID_EXPORT_FORMAT'
    );
  }
  return format as ExportFormat;
}

function filename(format: ExportFormat): string {
  const stamp = new Date().toISOString().slice(0, 10);
  switch (format) {
    case 'graphml':
      return `knowledge-graph-${stamp}.graphml`;
    case 'gexf':
      return `knowledge-graph-${stamp}.gexf`;
    case 'csv-bundle':
      return `knowledge-graph-${stamp}.zip`;
    case 'json':
      return `knowledge-graph-${stamp}.json`;
    default:
      return `export-${stamp}.bin`;
  }
}

export class ExportController {
  private createCsvZip(bundle: { entities: string; relationships: string; papers: string }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 6 } });
      const chunks: Buffer[] = [];
      archive.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      archive.append(bundle.entities, { name: 'entities.csv' });
      archive.append(bundle.relationships, { name: 'relationships.csv' });
      archive.append(bundle.papers, { name: 'papers.csv' });
      archive.finalize();
    });
  }

  async export(
    request: FastifyRequest<{ Querystring: { format?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createError('Tenant ID is required', 400, 'TENANT_REQUIRED');
    }

    const format = getFormat(request);
    const db = createDatabaseClient(tenantId);
    const exportService = new ExportService(db);
    const payload = await exportService.getExportData();

    const name = filename(format);

    switch (format) {
      case 'graphml': {
        const body = exportService.toGraphML(payload);
        reply
          .header('Content-Type', 'application/xml')
          .header('Content-Disposition', `attachment; filename="${name}"`)
          .send(body);
        return;
      }
      case 'gexf': {
        const body = exportService.toGEXF(payload);
        reply
          .header('Content-Type', 'application/xml')
          .header('Content-Disposition', `attachment; filename="${name}"`)
          .send(body);
        return;
      }
      case 'json': {
        const body = exportService.toJson(payload);
        reply
          .header('Content-Type', 'application/json')
          .header('Content-Disposition', `attachment; filename="${name}"`)
          .send(body);
        return;
      }
      case 'csv-bundle': {
        const bundle = exportService.toCsvBundle(payload);
        const zipBuffer = await this.createCsvZip(bundle);
        reply
          .header('Content-Type', 'application/zip')
          .header('Content-Disposition', `attachment; filename="${name}"`)
          .send(zipBuffer);
        return;
      }
      default:
        throw createError('Unsupported export format', 400, 'INVALID_EXPORT_FORMAT');
    }
  }
}

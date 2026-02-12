import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { errorHandler } from './middleware';
import {
  registerPapersRoutes,
  registerGraphRoutes,
  registerEdgesRoutes,
  registerSearchRoutes,
  registerInsightsRoutes,
  registerStatsRoutes,
  registerPipelineRoutes,
  registerNodesRoutes,
  registerUsageRoutes,
  registerEntityLinksRoutes,
  registerSettingsRoutes,
  registerTenantsRoutes,
  registerReviewRoutes,
  registerExportRoutes,
} from './routes';
import { createDatabaseClient } from '../db/client';
import { SearchController } from './controllers/searchController';
import { SearchService } from './services/searchService';
import { requireTenant } from './middleware';

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Register CORS with support for multiple origins and Vercel preview deployments
  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        cb(null, true);
        return;
      }

      const corsOrigin = process.env.CORS_ORIGIN || '*';

      // Allow all origins if set to '*'
      if (corsOrigin === '*') {
        cb(null, true);
        return;
      }

      // Support comma-separated list of origins
      const allowedOrigins = corsOrigin.split(',').map(o => o.trim());

      // Check if origin matches any allowed origin
      if (allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }

      // Allow all Vercel preview deployments for this project
      // Matches: https://research-agent-*-geddydukes-projects.vercel.app
      if (/^https:\/\/research-agent-.*-geddydukes-projects\.vercel\.app$/.test(origin)) {
        cb(null, true);
        return;
      }

      // Also allow the main production domain pattern
      if (/^https:\/\/research-agent.*\.vercel\.app$/.test(origin)) {
        cb(null, true);
        return;
      }

      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  // Register error handler
  fastify.setErrorHandler(errorHandler);

  if (process.env.NODE_ENV === 'production' && !process.env.ENCRYPTION_KEY?.trim()) {
    throw new Error('ENCRYPTION_KEY is required in production');
  }

  if (!process.env.SUPABASE_ANON_KEY) {
    fastify.log.warn(
      'SUPABASE_ANON_KEY is not set. Sign-in will fail with 401. Use the publishable/anon public key from Supabase Dashboard → API (not the service_role secret).'
    );
  }

  // Health check (no tenant required)
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.get('/api/arxiv', {
    preHandler: requireTenant,
  }, async (request: any, reply) => {
    const tenantId = request.tenantId!;
    const db = createDatabaseClient(tenantId);
    const searchService = new SearchService(db);
    const controller = new SearchController(searchService);
    await controller.searchArxiv(request, reply);
  });

  // Register all routes (routes will create tenant-scoped database clients)
  registerPapersRoutes(fastify);
  registerGraphRoutes(fastify);
  registerEdgesRoutes(fastify);
  registerSearchRoutes(fastify);
  registerInsightsRoutes(fastify);
  registerStatsRoutes(fastify);
  registerPipelineRoutes(fastify);
  registerNodesRoutes(fastify);
  registerUsageRoutes(fastify);
  registerSettingsRoutes(fastify);
  registerTenantsRoutes(fastify);
  registerReviewRoutes(fastify);
  registerExportRoutes(fastify);
  await registerEntityLinksRoutes(fastify);

  return fastify;
}

async function start() {
  console.log('API server starting...');
  try {
    const server = await buildServer();
    const port = parseInt(process.env.PORT || process.env.API_PORT || '3000', 10);
    const host = process.env.API_HOST || '0.0.0.0';
    console.log('Binding to %s:%s...', host, port);
    await server.listen({ port, host });
    console.log('API server listening on http://%s:%s', host, port);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

const isEntryPoint =
  typeof require !== 'undefined' && require.main === module;
const isRunDirectly =
  process.argv.some(
    (a) => typeof a === 'string' && (a.includes('server.ts') || a.includes('server.js'))
  );

if (isEntryPoint || isRunDirectly) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export { buildServer };

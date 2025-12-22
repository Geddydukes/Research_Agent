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
} from './routes';

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register CORS
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Register error handler
  fastify.setErrorHandler(errorHandler);

  // Health check (no tenant required)
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
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
  await registerEntityLinksRoutes(fastify);

  return fastify;
}

async function start() {
  try {
    const server = await buildServer();
    // Use PORT (set by hosting platforms like Railway) or fall back to API_PORT or 3000
    const port = parseInt(process.env.PORT || process.env.API_PORT || '3000', 10);
    const host = process.env.API_HOST || '0.0.0.0';

    await server.listen({ port, host });

    console.log(`?? API server listening on http://${host}:${port}`);
    console.log(`?? API documentation available at http://${host}:${port}/health`);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

export { buildServer };

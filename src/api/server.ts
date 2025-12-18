import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createDatabaseClient } from '../db/client';
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

  // Initialize database client
  const db = createDatabaseClient();

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register all routes
  registerPapersRoutes(fastify, db);
  registerGraphRoutes(fastify, db);
  registerEdgesRoutes(fastify, db);
  registerSearchRoutes(fastify, db);
  registerInsightsRoutes(fastify, db);
  registerStatsRoutes(fastify, db);
  registerPipelineRoutes(fastify);
  registerNodesRoutes(fastify, db);

  return fastify;
}

async function start() {
  try {
    const server = await buildServer();
    const port = parseInt(process.env.API_PORT || '3000', 10);
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

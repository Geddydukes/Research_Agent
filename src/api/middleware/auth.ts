import type { FastifyRequest, FastifyReply } from 'fastify';
import { createError } from './errorHandler';

export async function requireApiKey(
  request: FastifyRequest,
  _reply: FastifyReply
) {
  const apiKey = request.headers['x-api-key'] as string | undefined;
  const expectedKey = process.env.API_KEY;

  // In development, allow missing key if not set
  if (!expectedKey) {
    if (process.env.NODE_ENV === 'production') {
      throw createError('API key authentication required', 401, 'AUTH_REQUIRED');
    }
    return; // Skip auth in dev if no key configured
  }

  if (!apiKey || apiKey !== expectedKey) {
    throw createError('Invalid or missing API key', 401, 'INVALID_API_KEY');
  }
}

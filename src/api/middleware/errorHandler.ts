import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export function createError(
  message: string,
  statusCode: number = 500,
  code?: string
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  request.log.error(error, 'Request error');

  reply.status(statusCode).send({
    error: {
      message,
      code: error.code || 'INTERNAL_ERROR',
      statusCode,
    },
  });
}

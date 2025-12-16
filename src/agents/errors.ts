import { z } from 'zod';

export class TimeoutError extends Error {
  constructor(
    public readonly agent: string,
    public readonly timeoutMs: number
  ) {
    super(`Agent ${agent} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export class SchemaValidationError extends Error {
  constructor(
    public readonly agent: string,
    public readonly validationErrors: z.ZodError,
    public readonly attempts: number
  ) {
    super(
      `Agent ${agent} failed schema validation after ${attempts} attempts: ${validationErrors.message}`
    );
    this.name = 'SchemaValidationError';
  }
}

export class AgentExecutionError extends Error {
  constructor(
    public readonly agent: string,
    public readonly originalError: Error
  ) {
    super(`Agent ${agent} execution failed: ${originalError.message}`);
    this.name = 'AgentExecutionError';
    this.cause = originalError;
  }
}


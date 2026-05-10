import type { H3Error } from 'h3'
import { z } from 'zod'

export interface NormalizedError {
  statusCode: number
  statusMessage: string
  message: string
  code?: string
  issues?: z.ZodIssue[]
  requestId?: string
}

export function normalizeError(err: unknown, requestId?: string): NormalizedError {
  if (err instanceof z.ZodError) {
    return {
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Validation failed',
      code: 'validation_error',
      issues: err.issues,
      requestId,
    }
  }
  const e = err as Partial<H3Error> & { code?: string }
  return {
    statusCode: e.statusCode ?? 500,
    statusMessage: e.statusMessage ?? 'Internal Server Error',
    message: e.message ?? 'Unknown error',
    code: e.code,
    requestId,
  }
}

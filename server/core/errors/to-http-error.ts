import { createError, isError, type H3Error } from 'h3'
import { ZodError } from 'zod'
import { AppError } from './app-error'

// Postgres error codes that are the caller's fault, not a server bug
const PG_ERRORS: Record<string, [number, string]> = {
  '23505': [409, 'Resource already exists'],
  '23503': [409, 'Referenced resource does not exist or is still in use'],
  '22P02': [400, 'Invalid input value'],
  '22007': [400, 'Invalid date/time value'],
  '22008': [400, 'Invalid date/time value']
}

/**
 * Maps any thrown value to the one error shape the API returns:
 * `{ statusCode, statusMessage, data: { code, details, requestId } }`.
 * The original error is kept as `cause` so the error-logging plugin can log it.
 */
export const toHttpError = (err: unknown, requestId?: string): H3Error => {
  if (isError(err)) return err

  if (err instanceof AppError) {
    return createError({ statusCode: err.statusCode, statusMessage: err.message, data: { code: err.code, details: err.details ?? null, requestId } })
  }

  if (err instanceof ZodError) {
    return createError({ statusCode: 400, statusMessage: 'Validation failed', data: { code: 'VALIDATION_ERROR', details: err.issues, requestId } })
  }

  const pgCode = (err as { code?: unknown } | null)?.code
  if (typeof pgCode === 'string' && PG_ERRORS[pgCode]) {
    const [statusCode, statusMessage] = PG_ERRORS[pgCode]
    return createError({ statusCode, statusMessage, data: { code: 'DB_CONSTRAINT', details: null, requestId } })
  }

  return createError({ statusCode: 500, statusMessage: 'Internal Server Error', data: { code: 'INTERNAL', details: null, requestId }, cause: err })
}

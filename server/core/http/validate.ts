import { getQuery, getRouterParams, readBody, type H3Event } from 'h3'
import type { z } from 'zod'
import { ValidationError } from '../errors/app-error'

// `message` keeps a route's established 400 text (e.g. 'name and body are required');
// without it the response says 'Validation failed'. The zod issues are always in data.details.
const run = <S extends z.ZodType>(schema: S, input: unknown, message?: string): z.infer<S> => {
  const result = schema.safeParse(input)
  if (!result.success) throw new ValidationError(result.error.issues, message)
  return result.data
}

export const parseBody = async <S extends z.ZodType>(event: H3Event, schema: S, message?: string) => run(schema, await readBody(event), message)
export const parseQuery = <S extends z.ZodType>(event: H3Event, schema: S, message?: string) => run(schema, getQuery(event), message)
export const parseParams = <S extends z.ZodType>(event: H3Event, schema: S, message?: string) => run(schema, getRouterParams(event), message)

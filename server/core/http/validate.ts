import { getQuery, getRouterParams, readBody, type H3Event } from 'h3'
import type { z } from 'zod'
import { ValidationError } from '../errors/app-error'

const run = <S extends z.ZodType>(schema: S, input: unknown): z.infer<S> => {
  const result = schema.safeParse(input)
  if (!result.success) throw new ValidationError(result.error.issues)
  return result.data
}

export const parseBody = async <S extends z.ZodType>(event: H3Event, schema: S) => run(schema, await readBody(event))
export const parseQuery = <S extends z.ZodType>(event: H3Event, schema: S) => run(schema, getQuery(event))
export const parseParams = <S extends z.ZodType>(event: H3Event, schema: S) => run(schema, getRouterParams(event))

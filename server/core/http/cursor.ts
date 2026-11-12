import type { z } from 'zod'
import { ValidationError } from '../errors/app-error'

// Opaque pagination cursors: clients pass back exactly what they were given.

export const encodeCursor = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')

export const decodeCursor = <S extends z.ZodType>(cursor: string, schema: S): z.infer<S> => {
  let raw: unknown
  try {
    raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw new ValidationError(null, 'Invalid cursor')
  }
  const result = schema.safeParse(raw)
  if (!result.success) throw new ValidationError(null, 'Invalid cursor')
  return result.data
}

import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { ValidationError } from '../../server/core/errors/app-error'
import { decodeCursor, encodeCursor } from '../../server/core/http/cursor'

const CursorSchema = z.object({ score: z.number().nullable(), at: z.string(), id: z.number().int() })

describe('cursor', () => {
  it('round-trips a value through an opaque, url-safe string', () => {
    const value = { score: 87, at: '2030-01-02T10:00:00.000Z', id: 42 }
    const cursor = encodeCursor(value)
    expect(cursor).toMatch(/^[\w-]+$/)
    expect(decodeCursor(cursor, CursorSchema)).toEqual(value)
  })

  it('rejects garbage', () => {
    expect(() => decodeCursor('not*base64', CursorSchema)).toThrow(ValidationError)
    expect(() => decodeCursor(encodeCursor('plain'), CursorSchema)).toThrow('Invalid cursor')
  })

  it('rejects a well-formed cursor with the wrong shape', () => {
    expect(() => decodeCursor(encodeCursor({ score: 'high', at: 'x', id: 1 }), CursorSchema)).toThrow(ValidationError)
  })
})

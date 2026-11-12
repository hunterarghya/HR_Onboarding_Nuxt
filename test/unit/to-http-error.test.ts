import { createError } from 'h3'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { ConflictError, ExternalServiceError, NotFoundError, ValidationError } from '../../server/core/errors/app-error'
import { toHttpError } from '../../server/core/errors/to-http-error'

describe('toHttpError', () => {
  it('maps AppErrors to their status, message and code', () => {
    const err = toHttpError(new NotFoundError('Template'), 'req-1')
    expect(err.statusCode).toBe(404)
    expect(err.statusMessage).toBe('Template not found')
    expect(err.data).toEqual({ code: 'NOT_FOUND', details: null, requestId: 'req-1' })

    expect(toHttpError(new ConflictError('Form exists')).statusCode).toBe(409)
    expect(toHttpError(new ExternalServiceError('Gmail')).statusCode).toBe(502)
  })

  it('keeps validation details', () => {
    const err = toHttpError(new ValidationError([{ path: ['salary'] }]))
    expect(err.statusCode).toBe(400)
    expect((err.data as any).details).toEqual([{ path: ['salary'] }])
  })

  it('maps zod errors to 400 with the issues', () => {
    const zodErr = z.object({ n: z.number() }).safeParse({ n: 'x' }).error
    const err = toHttpError(zodErr)
    expect(err.statusCode).toBe(400)
    expect(err.data).toMatchObject({ code: 'VALIDATION_ERROR', details: [expect.objectContaining({ path: ['n'] })] })
  })

  it('maps caller-caused postgres errors', () => {
    expect(toHttpError(Object.assign(new Error('dup'), { code: '23505' })).statusCode).toBe(409)
    expect(toHttpError(Object.assign(new Error('bad int'), { code: '22P02' })).statusCode).toBe(400)
  })

  it('passes existing h3 errors through untouched', () => {
    const original = createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    expect(toHttpError(original)).toBe(original)
  })

  it('hides unknown errors behind a generic 500 but keeps them as the cause', () => {
    const boom = new Error('connection string contains a password')
    const err = toHttpError(boom, 'req-2')
    expect(err.statusCode).toBe(500)
    expect(err.statusMessage).toBe('Internal Server Error')
    expect(err.data).toEqual({ code: 'INTERNAL', details: null, requestId: 'req-2' })
    expect(err.cause).toBe(boom)
  })

  it('treats unknown pg codes and non-errors as 500', () => {
    expect(toHttpError(Object.assign(new Error('x'), { code: '99999' })).statusCode).toBe(500)
    expect(toHttpError('just a string').statusCode).toBe(500)
    expect(toHttpError(null).statusCode).toBe(500)
  })
})

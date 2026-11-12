import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const find = vi.fn()
const save = vi.fn()
vi.mock('~~/server/features/auth/google-credentials.repository', () => ({ googleCredentialsRepository: { find, save } }))

const { signSession, verifySession } = await import('../../server/core/auth/session-token')
const { googleAuthService } = await import('../../server/features/auth/google-auth.service')

describe('session token', () => {
  it('carries the user id, email and name only (never Google tokens)', () => {
    const token = signSession({ id: 7, email: 'hr@example.com', name: 'HR' })
    const payload = jwt.decode(token) as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['email', 'exp', 'iat', 'name', 'sub'])
    expect(payload.sub).toBe('7')
    expect(verifySession(token)).toEqual({ id: 7, email: 'hr@example.com', name: 'HR' })
  })

  it('rejects older sessions without a user id', () => {
    const legacy = jwt.sign({ email: 'hr@example.com', tokens: { access_token: 'x' } }, process.env.JWT_SECRET!)
    expect(() => verifySession(legacy)).toThrow('Malformed session')
  })
})

describe('googleAuthService', () => {
  beforeEach(() => {
    find.mockReset()
    save.mockReset().mockResolvedValue(undefined)
  })

  it('builds a client from the stored credentials', async () => {
    find.mockResolvedValue({ access_token: 'at', refresh_token: 'rt', expiry_date: 123 })
    const client = await googleAuthService.getAuthClientForUser(3)
    expect(client.credentials).toMatchObject({ access_token: 'at', refresh_token: 'rt' })
    expect(find).toHaveBeenCalledWith(3)
  })

  it('stores tokens Google refreshes during a call', async () => {
    find.mockResolvedValue({ access_token: 'old', refresh_token: 'rt' })
    const client = await googleAuthService.getAuthClientForUser(3)
    client.emit('tokens', { access_token: 'new', expiry_date: 999 })
    expect(save).toHaveBeenCalledWith(3, { access_token: 'new', expiry_date: 999 })
  })

  it('asks the user to sign in again when nothing is stored (401)', async () => {
    find.mockResolvedValue(null)
    await expect(googleAuthService.getAuthClientForUser(3)).rejects.toMatchObject({ statusCode: 401 })
    await expect(googleAuthService.findAuthClientForUser(3)).resolves.toBeNull()
  })
})

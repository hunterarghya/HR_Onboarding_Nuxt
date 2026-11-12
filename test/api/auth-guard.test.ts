import { describe, expect, it } from 'vitest'
import { listRoutes } from '../helpers/routes'
import { api, expectError } from './helpers/http'
import { db } from './helpers/db'
import { expiredToken, legacyToken, tokenWithWrongSecret, userToken } from './helpers/tokens'

// Mirrors server/core/auth/public-routes.ts on purpose: adding a public route must be a visible,
// two-file change. /auth/google/callback is outside /api (it's the OAuth redirect target).
const PUBLIC = new Set(['GET /api/health', 'GET /api/auth/google', 'POST /api/auth/logout', 'POST /api/interviews/webhook', 'GET /auth/google/callback'])

const protectedRoutes = listRoutes()
  .filter(r => !PUBLIC.has(r.title))
  .map(r => ({ ...r, url: r.path.replace(/:\w+/g, '1') }))

describe('authentication on every route', () => {
  it.each(protectedRoutes)('$title needs a session', async ({ method, url }) => {
    expectError(await api(method, url, { token: null, body: method === 'GET' ? undefined : {} }), 401, 'Unauthorized')
  })

  it('rejects expired and foreign tokens alike', async () => {
    expectError(await api('GET', '/api/jobs', { token: expiredToken() }), 401, 'Invalid or expired session')
    expectError(await api('GET', '/api/jobs', { token: tokenWithWrongSecret() }), 401, 'Invalid or expired session')
  })

  it('rejects sessions from before Google tokens moved server-side', async () => {
    expectError(await api('GET', '/api/jobs', { token: legacyToken() }), 401, 'Invalid or expired session')
  })

  it('asks a user without stored Google credentials to sign in again', async () => {
    const { rows } = await db().query('INSERT INTO users (email) VALUES (\'no-google@example.com\') ON CONFLICT (email) DO UPDATE SET name = NULL RETURNING id')
    const token = userToken({ email: 'no-google@example.com' }, rows[0].id)
    expectError(await api('POST', '/api/interviews/sync-calendar', { token }), 401, 'Google account not connected. Please sign in again.')
    // optional Google extras just skip: the job is still created
    expect((await api('POST', '/api/jobs', { token, body: { role: 'No Google' } })).status).toBe(201)
  })

  it('cannot be dodged with path tricks', async () => {
    for (const path of ['/API/jobs', '/api//jobs', '/api/jobs/', '/api/%6Aobs']) {
      const res = await api('GET', path, { token: null })
      expect(res.status, path).not.toBe(200)
    }
  })

  it('leaves the public routes open', async () => {
    expect((await api('GET', '/api/health', { token: null })).status).toBe(200)
    expect((await api('GET', '/api/auth/google', { token: null })).status).toBe(200)
    expect((await api('POST', '/api/interviews/webhook', { token: null, body: {} })).status).toBe(200)
  })
})

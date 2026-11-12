import { describe, expect, it } from 'vitest'
import { api } from './helpers/http'
import { userToken } from './helpers/tokens'
import { TEST_GOOGLE_CLIENT_ID } from './setup/test-env'

describe('GET /api/health', () => {
  it('reports ok while the database is up, and each dependency separately', async () => {
    const res = await api('GET', '/api/health')
    expect(res.status).toBe(200)
    // Qdrant and the LLM are unreachable in the smoke environment: reported, but not fatal
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'ok', vectorStore: 'error', llm: 'error', llmProvider: 'ollama' } })
  })

  it('tags every response with a request id', async () => {
    const res = await api('GET', '/api/health')
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reuses a well-formed incoming request id and ignores a malformed one', async () => {
    const reused = await api('GET', '/api/health', { headers: { 'x-request-id': 'proxy-id-12345' } })
    expect(reused.headers.get('x-request-id')).toBe('proxy-id-12345')
    const replaced = await api('GET', '/api/health', { headers: { 'x-request-id': 'bad id <script>' } })
    expect(replaced.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('GET /api/auth/google', () => {
  it('returns the Google consent URL with offline access and all scopes', async () => {
    const res = await api('GET', '/api/auth/google')
    expect(res.status).toBe(200)
    const url = new URL(res.body.url)
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('client_id')).toBe(TEST_GOOGLE_CLIENT_ID)
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('scope')?.split(' ')).toHaveLength(8)
  })
})

describe('GET /auth/google/callback', () => {
  it('redirects to the login page with an error when the code exchange fails', async () => {
    const res = await api('GET', '/auth/google/callback', { query: { code: 'bogus' } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/login?error=auth_failed')
  })
})

describe('GET /api/whatsapp/status', () => {
  it('reports the client state to signed-in users', async () => {
    const res = await api('GET', '/api/whatsapp/status')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: expect.stringMatching(/^(initializing|error)$/), qrCodeData: null })
  })
})

describe('GET /api/whatsapp/groups', () => {
  it('returns an empty list while the client is not ready', async () => {
    const res = await api('GET', '/api/whatsapp/groups')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe('GET /api/auth/me', () => {
  it('returns the signed-in user from a Bearer token or the session cookie', async () => {
    const viaHeader = await api('GET', '/api/auth/me')
    expect(viaHeader.status).toBe(200)
    expect(viaHeader.body).toEqual({ id: expect.any(Number), email: 'smoke.tester@example.com', name: 'Smoke Tester' })

    const viaCookie = await api('GET', '/api/auth/me', { token: null, headers: { cookie: `hr_session=${userToken()}` } })
    expect(viaCookie.body).toEqual(viaHeader.body)
  })

  it('rejects a missing or forged cookie', async () => {
    expect((await api('GET', '/api/auth/me', { token: null })).status).toBe(401)
    expect((await api('GET', '/api/auth/me', { token: null, headers: { cookie: 'hr_session=forged.jwt.value' } })).status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the httpOnly session cookie, even without a session', async () => {
    const res = await api('POST', '/api/auth/logout', { token: null })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Signed out' })
    expect(res.headers.get('set-cookie')).toMatch(/^hr_session=;.*Max-Age=0/)
  })
})

describe('pages behind the session cookie (server-side rendering)', () => {
  it('sends a visitor without a session to /login', async () => {
    const res = await api('GET', '/', { token: null })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/login')
  })

  it('renders the app for a signed-in visitor (the guard forwards the cookie to /api/auth/me)', async () => {
    const res = await api('GET', '/', { token: null, headers: { cookie: `hr_session=${userToken()}` } })
    expect(res.status).toBe(200)
    expect(res.body).toContain('<html')
  })
})

describe('cross-origin requests', () => {
  it('get no CORS permission: the API is same-origin only', async () => {
    const res = await api('GET', '/api/auth/me', { headers: { origin: 'https://evil.example' } })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

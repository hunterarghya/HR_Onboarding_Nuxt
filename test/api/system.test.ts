import { describe, expect, it } from 'vitest'
import { api } from './helpers/http'
import { TEST_GOOGLE_CLIENT_ID } from './setup/test-env'

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = await api('GET', '/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
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

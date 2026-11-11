import jwt from 'jsonwebtoken'
import { it } from 'vitest'
import { TEST_JWT_SECRET } from '../setup/test-env'
import { api, expectError } from './http'

// Same payload shape the OAuth callback signs today. The Google tokens are fake, and the server under
// test has no network, so any Google call made with them fails fast.
export const userToken = (overrides: Record<string, unknown> = {}) => jwt.sign(
  {
    email: 'smoke.tester@example.com',
    name: 'Smoke Tester',
    tokens: { access_token: 'fake-access-token', refresh_token: 'fake-refresh-token' },
    ...overrides
  },
  TEST_JWT_SECRET,
  { expiresIn: '1h' }
)

export const tokenWithWrongSecret = () => jwt.sign({ email: 'intruder@example.com' }, 'not-the-server-secret')

/** The inline auth check most protected routes have today: no token → 401, bad token → 403. */
export const itChecksToken = (method: string, path: string, body?: unknown) => {
  it('rejects a request without a token (401)', async () => {
    expectError(await api(method, path, { body }), 401, 'Unauthorized')
  })

  it('rejects a token signed with another secret (403)', async () => {
    expectError(await api(method, path, { body, token: tokenWithWrongSecret() }), 403, 'Invalid token')
  })
}

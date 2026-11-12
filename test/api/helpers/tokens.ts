import jwt from 'jsonwebtoken'
import { inject } from 'vitest'
import { TEST_JWT_SECRET } from '../setup/test-env'

// Same shape the OAuth callback signs: who the user is, no Google tokens. The test user's (fake)
// Google tokens are stored server-side by the global setup.
export const userToken = (overrides: Record<string, unknown> = {}, userId: number = inject('testUserId')) => jwt.sign(
  { email: 'smoke.tester@example.com', name: 'Smoke Tester', ...overrides },
  TEST_JWT_SECRET,
  { subject: String(userId), expiresIn: '1h' }
)

export const tokenWithWrongSecret = () => jwt.sign({ email: 'intruder@example.com' }, 'not-the-server-secret', { subject: '1' })

export const expiredToken = () => jwt.sign({ email: 'smoke.tester@example.com', exp: Math.floor(Date.now() / 1000) - 60 }, TEST_JWT_SECRET, { subject: '1' })

/** A Phase 1–3 style session (Google tokens inside, no user id): no longer accepted. */
export const legacyToken = () => jwt.sign(
  { email: 'smoke.tester@example.com', tokens: { access_token: 'leaked' } },
  TEST_JWT_SECRET,
  { expiresIn: '1h' }
)

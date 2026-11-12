import jwt from 'jsonwebtoken'
import { TEST_JWT_SECRET } from '../setup/test-env'

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

export const expiredToken = () => jwt.sign({ email: 'smoke.tester@example.com', exp: Math.floor(Date.now() / 1000) - 60 }, TEST_JWT_SECRET)

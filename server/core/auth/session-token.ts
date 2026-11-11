import jwt from 'jsonwebtoken'
import { config } from '~~/server/config/env'

export interface SessionUser {
  email: string
  name?: string
  // TEMPORARY: Google OAuth tokens still ride in the session until they move server-side (SEC-01)
  tokens?: Record<string, any>
}

export const signSession = (user: SessionUser): string =>
  jwt.sign(user, config.auth.jwtSecret, { expiresIn: '24h' })

/** Throws if the token is malformed, expired or signed with another secret. */
export const verifySession = (token: string): SessionUser => {
  const payload = jwt.verify(token, config.auth.jwtSecret)
  if (typeof payload !== 'object' || typeof payload.email !== 'string') throw new Error('Malformed session')
  return { email: payload.email, name: payload.name, tokens: payload.tokens }
}

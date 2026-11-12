import jwt from 'jsonwebtoken'
import { config } from '~~/server/config/env'

/** Who is signed in. Google tokens are never part of the session (they stay in the database). */
export interface SessionUser {
  id: number
  email: string
  name?: string
}

export const signSession = (user: SessionUser): string =>
  jwt.sign({ email: user.email, name: user.name }, config.auth.jwtSecret, { subject: String(user.id), expiresIn: '24h' })

/** Throws if the token is malformed, expired, signed with another secret, or from before user ids existed. */
export const verifySession = (token: string): SessionUser => {
  const payload = jwt.verify(token, config.auth.jwtSecret)
  if (typeof payload !== 'object' || typeof payload.email !== 'string') throw new Error('Malformed session')

  const id = Number(payload.sub)
  if (!Number.isInteger(id) || id <= 0) throw new Error('Malformed session')

  return { id, email: payload.email, name: typeof payload.name === 'string' ? payload.name : undefined }
}

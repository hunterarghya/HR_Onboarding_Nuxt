import { createError, type H3Event } from 'h3'
import type { SessionUser } from './session-token'

/** The signed-in user that middleware/02.auth.ts attached to the request. */
export const requireUser = (event: H3Event): SessionUser => {
  const user = event.context.user
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}

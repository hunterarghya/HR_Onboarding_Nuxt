import { isApiPath, isPublicRoute } from '~~/server/core/auth/public-routes'
import { readSessionCookie } from '~~/server/core/auth/session-cookie'
import { verifySession } from '~~/server/core/auth/session-token'
import { config } from '~~/server/config/env'
import { isEmailAllowed } from '~~/server/core/auth/login-allowlist'

// Default-deny: every /api request needs a valid session unless its route is listed as public.
// The browser sends the httpOnly session cookie; API clients and tests may send a Bearer token instead.
export default defineEventHandler((event) => {
  if (!isApiPath(event.path) || isPublicRoute(event.method, event.path)) return

  const header = getHeader(event, 'authorization')
  const token = (header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined) || readSessionCookie(event)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  let user
  try {
    user = verifySession(token)
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired session' })
  }
  // Removing someone from the allowlist ends their access at once, not when their session expires
  if (!isEmailAllowed(user.email, config.auth.allowlist)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired session' })
  }
  event.context.user = user
})

import { isApiPath, isPublicRoute } from '~~/server/core/auth/public-routes'
import { verifySession } from '~~/server/core/auth/session-token'

// Default-deny: every /api request needs a valid session unless its route is listed as public.
export default defineEventHandler((event) => {
  if (!isApiPath(event.path) || isPublicRoute(event.method, event.path)) return

  const header = getHeader(event, 'authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  try {
    event.context.user = verifySession(token)
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired session' })
  }
})

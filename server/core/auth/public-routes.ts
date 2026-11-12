// The only /api routes reachable without a session. Everything else under /api is denied by default.
const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'GET /api/auth/google',
  'POST /api/auth/logout', // must work with an expired session too
  'POST /api/interviews/webhook' // Google Calendar push notifications carry no session
])

/** Normalises the path so `/API//health/` can't be used to dodge the check either way. */
export const normalizePath = (path: string): string => {
  let pathname = path.split('?')[0] ?? ''
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    // keep the raw path; a malformed one simply won't match a public route
  }
  return pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1').toLowerCase()
}

export const isApiPath = (path: string): boolean => {
  const p = normalizePath(path)
  return p === '/api' || p.startsWith('/api/')
}

export const isPublicRoute = (method: string, path: string): boolean =>
  PUBLIC_ROUTES.has(`${method.toUpperCase()} ${normalizePath(path)}`)

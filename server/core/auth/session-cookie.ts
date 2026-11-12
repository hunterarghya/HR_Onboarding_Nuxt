import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3'
import { config } from '~~/server/config/env'

// The session lives in an httpOnly cookie: page scripts can't read it (no token theft through XSS)
// and it never appears in a URL. SameSite=Lax keeps it off cross-site POSTs.

export const SESSION_COOKIE = 'hr_session'
const MAX_AGE_SECONDS = 24 * 60 * 60 // same lifetime as the JWT inside

export const setSessionCookie = (event: H3Event, token: string) => {
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Production is expected behind HTTPS; browsers also accept Secure cookies on http://localhost
    secure: config.env === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS
  })
}

export const clearSessionCookie = (event: H3Event) => {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export const readSessionCookie = (event: H3Event) => getCookie(event, SESSION_COOKIE)

import { defineEventHandler, sendRedirect } from 'h3'
import { requireUser } from '~~/server/core/auth/current-user'
import { clearSessionCookie, setSessionCookie } from '~~/server/core/auth/session-cookie'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseQuery } from '~~/server/core/http/validate'
import { GoogleCallbackQuery } from './auth.dto'
import { authService } from './auth.service'

export const authController = {
  getGoogleAuthUrl: defineApiHandler(() => ({ url: authService.buildGoogleAuthUrl() })),

  /**
   * Google's OAuth redirect target (a browser navigation, not an API call). Success sets the
   * httpOnly session cookie and opens the app; any failure goes back to the login page with a reason.
   */
  handleGoogleCallback: defineEventHandler(async (event) => {
    try {
      const { code } = parseQuery(event, GoogleCallbackQuery)
      setSessionCookie(event, await authService.completeGoogleLogin(code))
      return sendRedirect(event, '/')
    } catch (err) {
      console.error('Error during Google callback:', err)
      return sendRedirect(event, `/login?error=auth_failed`)
    }
  }),

  /** Who is signed in. The frontend's route guard calls this, since page scripts can't read the cookie. */
  me: defineApiHandler((event) => {
    const { id, email, name } = requireUser(event)
    return { id, email, name: name ?? null }
  }),

  /** Clears the session cookie. Public, so it also works once the session has expired. */
  logout: defineApiHandler((event) => {
    clearSessionCookie(event)
    return { message: 'Signed out' }
  })
}

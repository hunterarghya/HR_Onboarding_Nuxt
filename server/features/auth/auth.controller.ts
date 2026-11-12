import { defineEventHandler, sendRedirect } from 'h3'
import { requireUser } from '~~/server/core/auth/current-user'
import { clearSessionCookie, setSessionCookie } from '~~/server/core/auth/session-cookie'
import { ForbiddenError } from '~~/server/core/errors/app-error'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseQuery } from '~~/server/core/http/validate'
import { COMPANY_NAME_MESSAGE, GoogleCallbackQuery, UpdateProfileBody } from './auth.dto'
import { authService } from './auth.service'
import { profileService } from './profile.service'

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
      if (err instanceof ForbiddenError) {
        console.warn('Sign-in refused: account not on the allowlist')
        return sendRedirect(event, '/login?error=not_allowed')
      }
      console.error('Error during Google callback:', err)
      return sendRedirect(event, `/login?error=auth_failed`)
    }
  }),

  /** Who is signed in. The frontend's route guard calls this, since page scripts can't read the cookie. */
  me: defineApiHandler(event => profileService.get(requireUser(event).id)),

  /** The HR sets the company name their emails use. */
  updateMe: defineApiHandler(async (event) => {
    const { id } = requireUser(event)
    const { company_name } = await parseBody(event, UpdateProfileBody, COMPANY_NAME_MESSAGE)
    return profileService.setCompanyName(id, company_name)
  }),

  /** Clears the session cookie. Public, so it also works once the session has expired. */
  logout: defineApiHandler((event) => {
    clearSessionCookie(event)
    return { message: 'Signed out' }
  })
}

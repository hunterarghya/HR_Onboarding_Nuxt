import { defineEventHandler, sendRedirect } from 'h3'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseQuery } from '~~/server/core/http/validate'
import { GoogleCallbackQuery } from './auth.dto'
import { authService } from './auth.service'

export const authController = {
  getGoogleAuthUrl: defineApiHandler(() => ({ url: authService.buildGoogleAuthUrl() })),

  /**
   * Google's OAuth redirect target (a browser navigation, not an API call), so every outcome is a
   * redirect back to the login page: with the session token, or with ?error=auth_failed.
   */
  handleGoogleCallback: defineEventHandler(async (event) => {
    try {
      const { code } = parseQuery(event, GoogleCallbackQuery)
      const token = await authService.completeGoogleLogin(code)
      // Redirect to frontend with token
      return sendRedirect(event, `/login?token=${token}`)
    } catch (err) {
      console.error('Error during Google callback:', err)
      return sendRedirect(event, `/login?error=auth_failed`)
    }
  })
}

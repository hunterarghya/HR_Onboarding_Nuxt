import { signSession } from '~~/server/core/auth/session-token'
import { exchangeCode, generateAuthUrl, getUserInfo } from '~~/server/integrations/google/oauth'

export const authService = {
  /** Google's consent page URL (offline access, all scopes the app uses). */
  buildGoogleAuthUrl: () => generateAuthUrl(),

  /**
   * Trades the code from Google's redirect for tokens and signs the app session (24 h).
   * The Google tokens still travel inside the session JWT (SEC-01, moved server-side in Phase 4).
   */
  async completeGoogleLogin(code: string) {
    const { client, tokens } = await exchangeCode(code)
    const userInfo = await getUserInfo(client)

    if (!userInfo.email) throw new Error('Google account returned no email')
    return signSession({
      email: userInfo.email,
      name: userInfo.name ?? undefined,
      tokens // Store tokens to access Gmail API later
    })
  }
}

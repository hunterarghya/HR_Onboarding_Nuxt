import { signSession } from '~~/server/core/auth/session-token'
import { exchangeCode, generateAuthUrl, getUserInfo } from '~~/server/integrations/google/oauth'
import { googleCredentialsRepository } from './google-credentials.repository'
import { usersRepository } from './users.repository'

export const authService = {
  /** Google's consent page URL (offline access, all scopes the app uses). */
  buildGoogleAuthUrl: () => generateAuthUrl(),

  /**
   * Trades the code from Google's redirect for tokens, records the user, stores the Google tokens
   * encrypted in the database, and signs the app session (24 h). The session holds no Google tokens.
   */
  async completeGoogleLogin(code: string) {
    const { client, tokens } = await exchangeCode(code)
    const userInfo = await getUserInfo(client)

    if (!userInfo.email) throw new Error('Google account returned no email')
    const user = await usersRepository.upsertOnLogin(userInfo.email, userInfo.name ?? null)
    await googleCredentialsRepository.save(user.id, tokens)

    return signSession({ id: user.id, email: user.email, name: user.name ?? undefined })
  }
}

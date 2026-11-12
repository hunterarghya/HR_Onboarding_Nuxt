import { UnauthorizedError } from '~~/server/core/errors/app-error'
import { createOAuthClient, type GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { googleCredentialsRepository } from './google-credentials.repository'

/**
 * A Google client for the user, built from the encrypted tokens in the database. When Google
 * refreshes the access token during a call, the new token is saved, so it survives restarts and
 * is shared with background workers.
 */
const buildClient = async (userId: number): Promise<GoogleAuthClient | null> => {
  const credentials = await googleCredentialsRepository.find(userId)
  if (!credentials) return null

  const client = createOAuthClient(credentials)
  client.on('tokens', (tokens) => {
    googleCredentialsRepository.save(userId, tokens).catch((err) => {
      console.error(`--- [Google] Could not store refreshed tokens for user ${userId}:`, (err as Error).message)
    })
  })
  return client
}

export const googleAuthService = {
  /** For Google-backed actions. No stored credentials means the user has to sign in again (401). */
  async getAuthClientForUser(userId: number): Promise<GoogleAuthClient> {
    const client = await buildClient(userId)
    if (!client) throw new UnauthorizedError('Google account not connected. Please sign in again.')
    return client
  },

  /** For optional Google extras (e.g. the form made when a job is posted): null instead of an error. */
  findAuthClientForUser: (userId: number) => buildClient(userId)
}

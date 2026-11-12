import { createOAuthClient, type GoogleAuthClient } from '~~/server/integrations/google/oauth'
import type { SessionUser } from './session-token'

// TEMPORARY: builds the Google client from tokens carried in the session JWT. Replaced by
// getAuthClientForUser(userId), which reads encrypted tokens from the database (SEC-01).
export const getAuthClientFromSession = (user: SessionUser): GoogleAuthClient =>
  createOAuthClient(user.tokens ?? {})

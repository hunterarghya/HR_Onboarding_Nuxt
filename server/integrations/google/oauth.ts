import { google, type Auth } from 'googleapis'
import { config } from '~~/server/config/env'
import { GOOGLE_SCOPES } from './scopes'

export type GoogleAuthClient = Auth.OAuth2Client
export type GoogleCredentials = Auth.Credentials

/** The single place an OAuth client is built. Every Google client in integrations/google takes one. */
export const createOAuthClient = (credentials?: GoogleCredentials): GoogleAuthClient => {
  const client = new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri)
  if (credentials) client.setCredentials(credentials)
  return client
}

export const generateAuthUrl = (): string =>
  createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent'
  })

/** Trades the ?code from Google's redirect for tokens, returning a client already holding them. */
export const exchangeCode = async (code: string) => {
  const client = createOAuthClient()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)
  return { client, tokens }
}

export const getUserInfo = async (client: GoogleAuthClient) => {
  const res = await google.oauth2({ version: 'v2', auth: client }).userinfo.get()
  return res.data
}

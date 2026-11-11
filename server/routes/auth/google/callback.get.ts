import { google } from 'googleapis'
import { config } from '~~/server/config/env'
import { signSession } from '~~/server/core/auth/session-token'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string

  try {
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    )

    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const userInfo = await oauth2.userinfo.get()

    if (!userInfo.data.email) throw new Error('Google account returned no email')
    const token = signSession({
      email: userInfo.data.email,
      name: userInfo.data.name ?? undefined,
      tokens // Store tokens to access Gmail API later
    })

    // Redirect to frontend with token
    return sendRedirect(event, `/login?token=${token}`)
  } catch (err) {
    console.error('Error during Google callback:', err)
    return sendRedirect(event, `/login?error=auth_failed`)
  }
})

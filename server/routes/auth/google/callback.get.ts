import { google } from 'googleapis'
import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const userInfo = await oauth2.userinfo.get()

    const token = jwt.sign(
      {
        email: userInfo.data.email,
        name: userInfo.data.name,
        tokens: tokens // Store tokens to access Gmail API later
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    )

    // Redirect to frontend with token
    return sendRedirect(event, `/login?token=${token}`)
  } catch (err) {
    console.error('Error during Google callback:', err)
    return sendRedirect(event, `/login?error=auth_failed`)
  }
})

import { signSession } from '~~/server/core/auth/session-token'
import { exchangeCode, getUserInfo } from '~~/server/integrations/google/oauth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string

  try {
    const { client, tokens } = await exchangeCode(code)
    const userInfo = await getUserInfo(client)

    if (!userInfo.email) throw new Error('Google account returned no email')
    const token = signSession({
      email: userInfo.email,
      name: userInfo.name ?? undefined,
      tokens // Store tokens to access Gmail API later
    })

    // Redirect to frontend with token
    return sendRedirect(event, `/login?token=${token}`)
  } catch (err) {
    console.error('Error during Google callback:', err)
    return sendRedirect(event, `/login?error=auth_failed`)
  }
})

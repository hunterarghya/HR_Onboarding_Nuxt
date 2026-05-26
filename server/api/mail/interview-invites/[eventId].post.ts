import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  let userData: any
  try { userData = jwt.verify(token, process.env.JWT_SECRET || 'secret') }
  catch { throw createError({ statusCode: 403, statusMessage: 'Invalid token' }) }

  const body = await readBody(event)
  const { templateId } = body
  if (!templateId) throw createError({ statusCode: 400, statusMessage: 'templateId is required' })

  const eventId = getRouterParam(event, 'eventId')

  try {
    const result = await sendInterviewInvites(
      userData.tokens, userData.email,
      parseInt(eventId!), parseInt(templateId)
    )
    return { message: 'Invites processed', ...result }
  } catch (err: any) {
    console.error('[Mail] Error sending invites:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to send invites', data: { details: err.message } })
  }
})

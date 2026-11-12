import { requireUser } from '~~/server/core/auth/current-user'
import { getAuthClientFromSession } from '~~/server/core/auth/google-session'

export default defineEventHandler(async (event) => {
  const userData = requireUser(event)

  const body = await readBody(event)
  const { templateId } = body
  if (!templateId) throw createError({ statusCode: 400, statusMessage: 'templateId is required' })

  const eventId = getRouterParam(event, 'eventId')

  try {
    const result = await sendInterviewInvites(
      getAuthClientFromSession(userData), userData.email,
      parseInt(eventId!), parseInt(templateId)
    )
    return { message: 'Invites processed', ...result }
  } catch (err: any) {
    console.error('[Mail] Error sending invites:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to send invites', data: { details: err.message } })
  }
})

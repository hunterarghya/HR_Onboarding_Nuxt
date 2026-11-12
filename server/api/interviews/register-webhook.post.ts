import { requireUser } from '~~/server/core/auth/current-user'
import { getAuthClientFromSession } from '~~/server/core/auth/google-session'

export default defineEventHandler(async (event) => {
  const userData = requireUser(event)

  const body = await readBody(event)
  const { webhook_url } = body

  if (!webhook_url) {
    throw createError({ statusCode: 400, statusMessage: 'webhook_url is required' })
  }

  try {
    const result = await registerCalendarWebhook(getAuthClientFromSession(userData), webhook_url)
    return { message: 'Webhook registered', data: result }
  } catch (err) {
    console.error('Error registering webhook:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to register webhook' })
  }
})

import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  let userData: any
  try { userData = jwt.verify(token, process.env.JWT_SECRET || 'secret') }
  catch { throw createError({ statusCode: 403, statusMessage: 'Invalid token' }) }

  const body = await readBody(event)
  const { webhook_url } = body

  if (!webhook_url) {
    throw createError({ statusCode: 400, statusMessage: 'webhook_url is required' })
  }

  try {
    const result = await registerCalendarWebhook(userData.tokens, webhook_url)
    return { message: 'Webhook registered', data: result }
  } catch (err) {
    console.error('Error registering webhook:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to register webhook' })
  }
})

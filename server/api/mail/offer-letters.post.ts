import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  let userData: any
  try { userData = jwt.verify(token, process.env.JWT_SECRET || 'secret') }
  catch { throw createError({ statusCode: 403, statusMessage: 'Invalid token' }) }

  const body = await readBody(event)
  const { templateId, candidateIds } = body
  if (!templateId || !candidateIds?.length) {
    throw createError({ statusCode: 400, statusMessage: 'templateId and candidateIds are required' })
  }

  try {
    const result = await sendOfferLetters(
      userData.tokens, userData.email,
      parseInt(templateId), candidateIds.map((id: any) => parseInt(id))
    )
    return { message: 'Offer letters processed', ...result }
  } catch (err: any) {
    console.error('[Mail] Error sending offers:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to send offers', data: { details: err.message } })
  }
})

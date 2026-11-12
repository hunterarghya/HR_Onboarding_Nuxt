import { requireUser } from '~~/server/core/auth/current-user'

export default defineEventHandler(async (event) => {
  const userData = requireUser(event)

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

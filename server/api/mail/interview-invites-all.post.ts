import { requireUser } from '~~/server/core/auth/current-user'

export default defineEventHandler(async (event) => {
  const userData = requireUser(event)

  const body = await readBody(event)
  const { templateId } = body
  if (!templateId) throw createError({ statusCode: 400, statusMessage: 'templateId is required' })

  const pool = usePool()

  try {
    const eventsResult = await pool.query(
      `SELECT DISTINCT ie.id FROM interview_events ie
       JOIN interview_candidates ic ON ic.event_id = ie.id
       WHERE ic.invite_sent = false`
    )

    let totalSent = 0, totalFailed = 0, totalSkipped = 0

    for (const evt of eventsResult.rows) {
      const result = await sendInterviewInvites(
        userData.tokens, userData.email,
        evt.id, parseInt(templateId)
      )
      totalSent += result.sent
      totalFailed += result.failed
      totalSkipped += result.skipped
    }

    return {
      message: 'Bulk invites processed',
      sent: totalSent, failed: totalFailed, skipped: totalSkipped,
      eventsProcessed: eventsResult.rows.length
    }
  } catch (err: any) {
    console.error('[Mail] Error sending bulk invites:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to send bulk invites', data: { details: err.message } })
  }
})

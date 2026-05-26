export default defineEventHandler(async () => {
  const pool = usePool()
  try {
    const result = await pool.query(
      `SELECT ie.id as event_id, ie.event_date,
              COUNT(ic.id) FILTER (WHERE ic.invite_sent = false) as unsent_count,
              COUNT(ic.id) as total_count
       FROM interview_events ie
       JOIN interview_candidates ic ON ic.event_id = ie.id
       GROUP BY ie.id, ie.event_date
       HAVING COUNT(ic.id) FILTER (WHERE ic.invite_sent = false) > 0`
    )
    return result.rows
  } catch (err) {
    console.error('Error fetching unsent invites:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})

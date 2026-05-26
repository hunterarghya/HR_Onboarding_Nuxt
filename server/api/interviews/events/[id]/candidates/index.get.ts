export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const pool = usePool()

  try {
    const result = await pool.query(
      `SELECT c.*, ic.assigned_at, ic.invite_sent
       FROM interview_candidates ic
       JOIN candidates c ON c.id = ic.candidate_id
       WHERE ic.event_id = $1
       ORDER BY c.score DESC`,
      [id]
    )
    return result.rows
  } catch (err) {
    console.error('Error fetching interview candidates:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})

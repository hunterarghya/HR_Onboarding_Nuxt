export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const { candidate_ids } = body
  const pool = usePool()

  if (!candidate_ids || !Array.isArray(candidate_ids)) {
    throw createError({ statusCode: 400, statusMessage: 'candidate_ids array is required' })
  }

  try {
    await pool.query('DELETE FROM interview_candidates WHERE event_id = $1', [id])

    if (candidate_ids.length > 0) {
      const values = candidate_ids.map((_: any, i: number) => `($1, $${i + 2})`).join(', ')
      const params = [id, ...candidate_ids]

      await pool.query(
        `INSERT INTO interview_candidates (event_id, candidate_id) VALUES ${values}
         ON CONFLICT (event_id, candidate_id) DO NOTHING`,
        params
      )
    }

    return { message: 'Candidates assigned successfully', count: candidate_ids.length }
  } catch (err) {
    console.error('Error assigning candidates manually:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})

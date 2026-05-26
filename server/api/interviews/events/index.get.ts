export default defineEventHandler(async () => {
  const pool = usePool()
  try {
    const result = await pool.query('SELECT * FROM interview_events ORDER BY event_date ASC, start_time ASC')
    return result.rows
  } catch (err) {
    console.error('Error fetching interview events:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})

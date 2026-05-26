export default defineEventHandler(async () => {
  const pool = usePool()
  try {
    const result = await pool.query('SELECT * FROM job_roles ORDER BY created_at DESC')
    return result.rows
  } catch (err) {
    console.error('Error fetching job roles:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})

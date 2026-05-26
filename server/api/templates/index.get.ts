export default defineEventHandler(async () => {
  const pool = usePool()
  try {
    const result = await pool.query(
      'SELECT * FROM email_templates ORDER BY type ASC, is_default DESC, name ASC'
    )
    return result.rows
  } catch (err) {
    console.error('Error fetching templates:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})

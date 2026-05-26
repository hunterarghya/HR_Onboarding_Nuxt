export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const pool = usePool()
  try {
    const result = await pool.query('SELECT * FROM email_templates WHERE id = $1', [id])
    if (result.rows.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }
    return result.rows[0]
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('Error fetching template:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})

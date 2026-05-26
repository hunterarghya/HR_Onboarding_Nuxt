export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const { name, subject, body: templateBody, type } = body
  const pool = usePool()

  if (!name || !templateBody) {
    throw createError({ statusCode: 400, statusMessage: 'name and body are required' })
  }

  try {
    const result = await pool.query(
      `UPDATE email_templates SET name = $1, subject = $2, body = $3, type = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 RETURNING *`,
      [name, subject || '', templateBody, type || 'custom', id]
    )

    if (result.rows.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }

    return result.rows[0]
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('Error updating template:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { name, subject, body: templateBody, type } = body
  const pool = usePool()

  if (!name || !templateBody) {
    throw createError({ statusCode: 400, statusMessage: 'name and body are required' })
  }

  try {
    const result = await pool.query(
      `INSERT INTO email_templates (name, subject, body, type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, subject || '', templateBody, type || 'custom']
    )
    setResponseStatus(event, 201)
    return result.rows[0]
  } catch (err) {
    console.error('Error creating template:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})

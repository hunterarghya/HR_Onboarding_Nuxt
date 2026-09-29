import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'secret')
  } catch (err) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Form ID is required' })
  }

  const pool = usePool()

  const result = await pool.query('DELETE FROM google_forms WHERE id = $1 RETURNING *', [id])
  if (result.rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Form not found' })
  }

  console.log(`--- [GoogleForms] Deleted form record: ${result.rows[0].form_id} ---`)

  return { message: 'Form removed', formId: result.rows[0].form_id }
})

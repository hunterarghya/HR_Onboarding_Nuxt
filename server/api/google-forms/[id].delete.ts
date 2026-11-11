export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Form ID is required' })
  }

  const query = getQuery(event)
  const isByJob = query.type === 'job'

  const pool = usePool()

  let result
  if (isByJob) {
    result = await pool.query('DELETE FROM google_forms WHERE job_role_id = $1 RETURNING *', [id])
  } else {
    result = await pool.query('DELETE FROM google_forms WHERE id::text = $1 OR form_id = $1 RETURNING *', [id])
  }

  if (result.rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Form not found' })
  }

  console.log(`--- [GoogleForms] Deleted form record: ${result.rows[0].form_id} ---`)

  return { message: 'Form removed', formId: result.rows[0].form_id }
})

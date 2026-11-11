import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  let userData: any
  try {
    userData = jwt.verify(token, process.env.JWT_SECRET || 'secret')
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token' })
  }

  const body = await readBody(event)
  const { jobRoleId } = body

  if (!jobRoleId) {
    throw createError({ statusCode: 400, statusMessage: 'jobRoleId is required' })
  }

  const pool = usePool()

  // Fetch the job role to use as the form title
  const jobResult = await pool.query('SELECT * FROM job_roles WHERE id = $1', [jobRoleId])
  if (jobResult.rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Job role not found' })
  }

  const job = jobResult.rows[0]

  // Check if a form already exists for this job role
  const existingForm = await pool.query('SELECT id FROM google_forms WHERE job_role_id = $1', [jobRoleId])
  if (existingForm.rows.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'A form already exists for this job role' })
  }

  try {
    console.log(`--- [GoogleForms] Creating form for job role: ${job.role} (id: ${jobRoleId}) ---`)

    const { formId, formUrl, questionMap } = await createApplicationForm(userData.tokens, job.role)

    // Save to database
    await pool.query(
      `INSERT INTO google_forms (form_id, form_url, form_title, job_role_id, question_map)
       VALUES ($1, $2, $3, $4, $5)`,
      [formId, formUrl, `Job Application: ${job.role}`, jobRoleId, JSON.stringify(questionMap)]
    )

    console.log(`--- [GoogleForms] Form saved to DB: ${formId} ---`)

    return {
      formId,
      formUrl,
      formTitle: `Job Application: ${job.role}`,
      questionMap
    }
  } catch (err: any) {
    console.error('--- [GoogleForms] Error creating form ---', err)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create Google Form',
      data: { error: err.message }
    })
  }
})

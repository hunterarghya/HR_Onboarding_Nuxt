import { requireUser } from '~~/server/core/auth/current-user'
import { getAuthClientFromSession } from '~~/server/core/auth/google-session'

export default defineEventHandler(async (event) => {
  const userData = requireUser(event)

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

    const { formId, formUrl, questionMap } = await createApplicationForm(getAuthClientFromSession(userData), job.role)

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

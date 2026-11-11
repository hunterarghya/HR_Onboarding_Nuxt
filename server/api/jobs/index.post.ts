import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { role, salary, qualification, skills, experience, location, shortlist_mode, deadline, min_score, criteria_weights } = body
  const pool = usePool()

  try {
    const result = await pool.query(
      'INSERT INTO job_roles (role, salary, qualification, skills, experience, location, shortlist_mode, deadline, min_score, criteria_weights) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [role, salary, qualification, skills, experience, location, shortlist_mode || 'manual', deadline, min_score || 60, JSON.stringify(criteria_weights || {})]
    )
    const newJob = result.rows[0]

    // Embed the new JD into Qdrant
    await upsertJobDescription(newJob)

    // Attempt to auto-create Google Form if user has valid Google OAuth tokens
    const authHeader = getHeader(event, 'authorization')
    const token = authHeader && authHeader.split(' ')[1]
    if (token) {
      try {
        const userData: any = jwt.verify(token, process.env.JWT_SECRET || 'secret')
        if (userData?.tokens) {
          const { formId, formUrl, questionMap } = await createApplicationForm(userData.tokens, newJob.role)
          await pool.query(
            `INSERT INTO google_forms (form_id, form_url, form_title, job_role_id, question_map)
             VALUES ($1, $2, $3, $4, $5)`,
            [formId, formUrl, `Job Application: ${newJob.role}`, newJob.id, JSON.stringify(questionMap)]
          )
          newJob.form_url = formUrl
          newJob.google_form_id = formId
          console.log(`--- [GoogleForms] Auto-created form for job ${newJob.id}: ${formUrl} ---`)
        }
      } catch (formErr: any) {
        console.warn('--- [GoogleForms] Could not auto-generate form on job creation ---', formErr?.message || formErr)
        // Non-blocking: job creation still succeeds
      }
    }

    setResponseStatus(event, 201)
    return newJob
  } catch (err) {
    console.error('Error creating job role:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})

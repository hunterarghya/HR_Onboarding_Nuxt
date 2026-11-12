import { requireUser } from '~~/server/core/auth/current-user'
import { getAuthClientFromSession } from '~~/server/core/auth/google-session'
import { googleFormsService } from '~~/server/modules/google-forms/google-forms.service'

export default defineEventHandler(async (event) => {
  const userData = requireUser(event)
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
    if (userData.tokens) {
      const form = await googleFormsService.tryCreateForJob(getAuthClientFromSession(userData), newJob)
      if (form) {
        newJob.form_url = form.formUrl
        newJob.google_form_id = form.formId
      }
    }

    setResponseStatus(event, 201)
    return newJob
  } catch (err) {
    console.error('Error creating job role:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})

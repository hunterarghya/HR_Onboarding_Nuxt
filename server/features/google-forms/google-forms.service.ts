import { AppError, ConflictError, NotFoundError } from '~~/server/core/errors/app-error'
import { batchUpdateForm, createForm } from '~~/server/integrations/google/forms.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import type { JobRoleRow } from '~~/server/database/types'
import { jobRolesRepository } from '../job-roles/job-roles.repository'
import { applicationFormTitle, buildQuestionRequests, mapQuestionIds } from './application-form.definition'
import { googleFormsRepository } from './google-forms.repository'

/**
 * Creates the standard application form for a job on Google Forms and records it.
 * Returns the form ID, public URL, and a map of field names → question IDs.
 */
const createAndSaveForm = async (auth: GoogleAuthClient, job: Pick<JobRoleRow, 'id' | 'role'>) => {
  console.log(`--- [GoogleForms] Creating form for: ${job.role} ---`)

  const title = applicationFormTitle(job.role)
  const { formId, responderUri: formUrl } = await createForm(auth, title)
  console.log(`--- [GoogleForms] Form created: ${formId} ---`)

  const requests = buildQuestionRequests()
  const updatedForm = await batchUpdateForm(auth, formId, requests)
  console.log(`--- [GoogleForms] ${requests.length} questions added ---`)

  const questionMap = mapQuestionIds(updatedForm?.items || [])
  console.log(`--- [GoogleForms] Question map: ${JSON.stringify(questionMap)} ---`)

  await googleFormsRepository.insert({ formId, formUrl, formTitle: title, jobRoleId: job.id, questionMap })
  console.log(`--- [GoogleForms] Form saved to DB: ${formId} ---`)

  return { formId, formUrl, formTitle: title, questionMap }
}

export const googleFormsService = {
  list: () => googleFormsRepository.findAllWithJobName(),

  /** "Generate form" on a job card. One form per job. */
  async createForJob(auth: GoogleAuthClient, jobRoleId: number) {
    const job = await jobRolesRepository.findById(jobRoleId)
    if (!job) throw new NotFoundError('Job role')
    if (await googleFormsRepository.existsForJob(jobRoleId)) throw new ConflictError('A form already exists for this job role')

    try {
      return await createAndSaveForm(auth, job)
    } catch (err) {
      console.error('--- [GoogleForms] Error creating form ---', err)
      throw new AppError(500, 'GOOGLE_FORM_FAILED', 'Failed to create Google Form', (err as Error).message)
    }
  },

  /** Best effort when a job is posted: a failure is logged and the job is still created. */
  async tryCreateForJob(auth: GoogleAuthClient, job: Pick<JobRoleRow, 'id' | 'role'>) {
    try {
      const { formId, formUrl } = await createAndSaveForm(auth, job)
      console.log(`--- [GoogleForms] Auto-created form for job ${job.id}: ${formUrl} ---`)
      return { formId, formUrl }
    } catch (err) {
      console.warn('--- [GoogleForms] Could not auto-generate form on job creation ---', (err as Error)?.message || err)
      return null
    }
  },

  /** Deletes by database id / Google form id, or (byJob) the form of a job. */
  async remove(id: string, byJob: boolean) {
    const rows = byJob
      ? await googleFormsRepository.deleteByJobId(Number(id))
      : await googleFormsRepository.deleteByIdOrFormId(id)
    if (rows.length === 0) throw new NotFoundError('Form')

    console.log(`--- [GoogleForms] Deleted form record: ${rows[0]!.form_id} ---`)
    return { message: 'Form removed', formId: rows[0]!.form_id }
  }
}

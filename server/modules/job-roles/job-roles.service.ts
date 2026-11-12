import { NotFoundError, ValidationError } from '~~/server/core/errors/app-error'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { googleFormsService } from '../google-forms/google-forms.service'
import { NO_FIELDS_MESSAGE, type CreateJobRoleInput, type UpdateJobRoleInput } from './job-roles.dto'
import { jobRolesRepository, UPDATABLE_FIELDS } from './job-roles.repository'
import { jobVectorsRepository } from './job-vectors.repository'

export const jobRolesService = {
  list: () => jobRolesRepository.findAllWithLatestForm(),

  /**
   * Saves the job, indexes its description for resume matching, and (when the user is signed in
   * with Google) creates its application form. Indexing and form failures don't fail the request.
   */
  async create(input: CreateJobRoleInput, googleAuth: GoogleAuthClient | null) {
    const job = await jobRolesRepository.insert(input)
    await jobVectorsRepository.upsert(job)

    const form = googleAuth ? await googleFormsService.tryCreateForJob(googleAuth, job) : null
    return form ? { ...job, form_url: form.formUrl, google_form_id: form.formId } : job
  },

  async update(id: number, patch: UpdateJobRoleInput) {
    const fields = Object.keys(patch).filter(f => (UPDATABLE_FIELDS as readonly string[]).includes(f))
    if (fields.length === 0) throw new ValidationError(null, NO_FIELDS_MESSAGE)

    const job = await jobRolesRepository.update(id, patch, fields)
    if (!job) throw new NotFoundError('Job role')

    // Re-embed the updated description
    await jobVectorsRepository.upsert(job)
    return (await jobRolesRepository.findByIdWithLatestForm(id)) ?? job
  },

  /** Boot: makes sure the Qdrant collection exists and re-indexes every job (sequential, blocking boot until Phase 5). */
  async resyncAllVectors() {
    await jobVectorsRepository.ensureCollection()
    const jobs = await jobRolesRepository.findAll()
    for (const job of jobs) {
      await jobVectorsRepository.upsert(job)
    }
    console.log(`--- [Vector] Synced ${jobs.length} jobs to Qdrant ---`)
  },

  /** No existence check: deleting an unknown id succeeds (unchanged; 404s arrive with BUG-12). */
  async remove(id: number) {
    await jobRolesRepository.delete(id)
    await jobVectorsRepository.remove(id)
  }
}

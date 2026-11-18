import { ConflictError, NotFoundError, ValidationError } from '~~/server/core/errors/app-error'
import { withTransaction } from '~~/server/core/db/transaction'
import { enqueue } from '~~/server/core/tasks/queues'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { googleFormsService } from '../google-forms/google-forms.service'
import type { CreateJobRoleInput, UpdateJobRoleInput } from './job-roles.dto'
import { jobRolesRepository, UPDATABLE_FIELDS } from './job-roles.repository'
import { jobVectorsRepository } from './job-vectors.repository'

/**
 * Queues index maintenance for one job. Already queued is fine (409 swallowed); if even Redis is
 * down the problem is logged, and the next boot's full resync repairs the index.
 */
const queueVectorTask = async (task: 'vectors.syncJob' | 'vectors.removeJob', job: { id: number, role: string }) => {
  try {
    await enqueue(task, { jobId: job.id, role: job.role }, { taskId: `${task === 'vectors.syncJob' ? 'vectors.job' : 'vectors.remove'}.${job.id}` })
  } catch (err) {
    if (!(err instanceof ConflictError)) console.error(`--- [Vector] Could not queue ${task} for job ${job.id}:`, (err as Error).message)
  }
}

/** Fields that feed the job's vectors; an edit that changes none of them leaves the index as it is */
const indexedText = (job: Parameters<typeof jobVectorsRepository.upsert>[0]) =>
  JSON.stringify([job.role, job.skills, job.qualification, job.experience_min_years, job.location, job.shortlist_mode, job.min_score, job.criteria_weights])

/** 409 if another job already has this name. */
const assertNameFree = async (role: string, exceptId?: number) => {
  const other = await jobRolesRepository.findByRoleName(role)
  if (other && other.id !== exceptId) throw new ConflictError(`A job named "${other.role}" already exists`)
}

export const JOB_VECTORS_RESYNC_TASK_ID = 'vectors.resyncAll'

export const jobRolesService = {
  list: () => jobRolesRepository.findAllWithLatestForm(),

  /**
   * Saves the job, queues indexing its description for resume matching, and (when the user is
   * signed in with Google) creates its application form. Indexing runs in the background (the
   * embedding model can take a while to load), so posting never waits on it; the Tasks page shows
   * when the job is ready to match. A form failure doesn't fail the request either: a missing form
   * can be generated from the job card.
   */
  async create(input: CreateJobRoleInput, googleAuth: GoogleAuthClient | null) {
    await assertNameFree(input.role)
    const job = await jobRolesRepository.insert(input)
    await queueVectorTask('vectors.syncJob', job)

    const form = googleAuth ? await googleFormsService.tryCreateForJob(googleAuth, job) : null
    return form ? { ...job, form_url: form.formUrl, google_form_id: form.formId } : job
  },

  async update(id: number, patch: UpdateJobRoleInput) {
    // the DTO is strict, so every key is an updatable column; the filter keeps the SQL safe regardless
    const fields = Object.keys(patch).filter(f => (UPDATABLE_FIELDS as readonly string[]).includes(f))
    if (fields.length === 0) throw new ValidationError(null, 'No valid fields provided for update')

    if (patch.role !== undefined) await assertNameFree(patch.role, id)
    // a new name is copied onto the job's candidates and events in the same transaction (BUG-10)
    const job = await withTransaction(async (client) => {
      const updated = await jobRolesRepository.update(id, patch, fields, client)
      if (updated && patch.role !== undefined) await jobRolesRepository.renameLinked(id, updated.role, client)
      return updated
    })
    if (!job) throw new NotFoundError('Job role')

    // Re-embed the updated description, in the background like a new job
    await queueVectorTask('vectors.syncJob', job)
    return (await jobRolesRepository.findByIdWithLatestForm(id)) ?? job
  },

  /** Boot: queues a full re-index instead of doing it before the server can answer. */
  async queueResyncAllVectors() {
    try {
      await enqueue('vectors.resyncAll', {}, { taskId: JOB_VECTORS_RESYNC_TASK_ID })
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err
    }
  },

  /**
   * Task vectors.resyncAll: makes sure the Qdrant collection exists and re-indexes every job.
   * Jobs that fail don't stop the others; the task then fails, so it is retried.
   */
  async resyncAllVectors() {
    await jobVectorsRepository.ensureCollection()
    const jobs = await jobRolesRepository.findAll()
    const failedIds: number[] = []
    for (const job of jobs) {
      try {
        await jobVectorsRepository.upsert(job)
      } catch {
        failedIds.push(job.id)
      }
    }
    console.log(`--- [Vector] Synced ${jobs.length - failedIds.length} of ${jobs.length} jobs to Qdrant ---`)
    if (failedIds.length > 0) throw new Error(`Could not index jobs ${failedIds.join(', ')}`)
    return { indexed: jobs.length }
  },

  /** Task vectors.syncJob: (re-)index one job (skipped if it was deleted meanwhile). */
  async syncJobVector(jobId: number) {
    let job = await jobRolesRepository.findById(jobId)
    if (!job) return { skipped: 'job no longer exists' }
    // An edit saved while this runs can't queue its own run (same task id, refused as a duplicate),
    // so index again until what was indexed is what's saved
    for (let pass = 0; pass < 3; pass++) {
      await jobVectorsRepository.upsert(job)
      const saved = await jobRolesRepository.findById(jobId)
      if (!saved) return { skipped: 'job no longer exists' }
      if (indexedText(saved) === indexedText(job)) break
      job = saved
    }
    return { indexed: jobId, role: job.role }
  },

  /** Task vectors.removeJob: drop a deleted job from the index, so resumes can't match it. */
  async removeJobVector(jobId: number) {
    await jobVectorsRepository.remove(jobId)
    return { removed: jobId }
  },

  /** The job's candidates and events stay, moved to Open. 404 for an unknown job (BUG-12). */
  async remove(id: number) {
    const deleted = await withTransaction(async (client) => {
      await jobRolesRepository.releaseLinked(id, client)
      return jobRolesRepository.delete(id, client)
    })
    if (!deleted) throw new NotFoundError('Job role')
    try {
      await jobVectorsRepository.remove(id)
    } catch {
      await queueVectorTask('vectors.removeJob', deleted)
    }
  }
}

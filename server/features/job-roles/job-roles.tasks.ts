import type { TaskProcessors } from '~~/server/core/tasks/registry'
import { jobRolesService } from './job-roles.service'

/** Queue "background": keeping the job-description index (Qdrant) in step with the job_roles table. */
export const jobRolesProcessors: TaskProcessors = {
  'vectors.resyncAll': () => jobRolesService.resyncAllVectors(),
  'vectors.syncJob': ({ jobId }) => jobRolesService.syncJobVector(jobId),
  'vectors.removeJob': ({ jobId }) => jobRolesService.removeJobVector(jobId)
}

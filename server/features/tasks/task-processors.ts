import type { TaskProcessors } from '~~/server/core/tasks/registry'
import { ingestionProcessors } from '../ingestion/ingestion.tasks'
import { interviewsProcessors } from '../interviews/interviews.tasks'
import { jobRolesProcessors } from '../job-roles/job-roles.tasks'
import { mailProcessors } from '../mail/mail.tasks'

/** Every feature's task processors, by task name. Started by plugins/30.tasks.ts. */
export const taskProcessors: TaskProcessors = {
  ...ingestionProcessors,
  ...interviewsProcessors,
  ...jobRolesProcessors,
  ...mailProcessors
}

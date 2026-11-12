import type { TaskProcessors } from '~~/server/core/tasks/registry'
import { ingestionProcessors } from '../ingestion/ingestion.tasks'

/** Every feature's task processors, by task name. Started by plugins/30.tasks.ts. */
export const taskProcessors: TaskProcessors = {
  ...ingestionProcessors
}

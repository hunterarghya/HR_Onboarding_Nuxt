import type { TaskProcessors } from '~~/server/core/tasks/registry'
import { calendarSyncService } from './calendar-sync.service'

/** Queue "background": payload → the same service function a synchronous caller would use. */
export const interviewsProcessors: TaskProcessors = {
  'calendar.sync': ({ userId }, ctx) => calendarSyncService.runSync(userId, ctx.reportProgress)
}

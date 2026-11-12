import type { TaskProcessors } from '~~/server/core/tasks/registry'
import { ingestionService } from './ingestion.service'

/** Queue "scans": payload → the same service functions a synchronous caller would use. */
export const ingestionProcessors: TaskProcessors = {
  'scan.gmail': ({ userId }, ctx) => ingestionService.runGmailScan(userId, ctx.reportProgress),
  'scan.forms': ({ userId, formIds }, ctx) => ingestionService.runFormsScan(userId, formIds, ctx.reportProgress),
  'scan.whatsapp': ({ userId, groupIds }, ctx) => ingestionService.runWhatsappScan(userId, groupIds, ctx.reportProgress)
}

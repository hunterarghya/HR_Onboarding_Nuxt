import type { TaskProcessors } from '~~/server/core/tasks/registry'
import { mailService } from './mail.service'

/** Queue "mail" (one batch at a time): payload → the same service functions a synchronous caller would use. */
export const mailProcessors: TaskProcessors = {
  'mail.invites': ({ userId, eventId, templateId }, ctx) => mailService.runEventInvites(userId, eventId, templateId, ctx.reportProgress),
  'mail.invitesAll': ({ userId, templateId }, ctx) => mailService.runAllInvites(userId, templateId, ctx.reportProgress),
  'mail.offers': ({ userId, templateId, candidateIds }, ctx) => mailService.runOffers(userId, templateId, candidateIds, ctx.reportProgress)
}

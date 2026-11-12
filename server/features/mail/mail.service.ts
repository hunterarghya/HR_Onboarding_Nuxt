import { config } from '~~/server/config/env'
import { NotFoundError, ValidationError } from '~~/server/core/errors/app-error'
import { enqueue } from '~~/server/core/tasks/queues'
import type { TaskProgress } from '~~/server/core/tasks/task-status'
import { sendRawMessage } from '~~/server/integrations/google/gmail.client'
import { buildRawEmail } from '~~/server/integrations/google/mime'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { googleAuthService } from '../auth/google-auth.service'
import { profileService } from '../auth/profile.service'
import { usersRepository } from '../auth/users.repository'
import { candidatesRepository } from '../candidates/candidates.repository'
import { interviewAssignmentsRepository } from '../interviews/interview-assignments.repository'
import { interviewEventsRepository } from '../interviews/interview-events.repository'
import { renderString, renderText } from '../templates/template-renderer'
import { templatesRepository } from '../templates/templates.repository'

// Bulk mail runs as background tasks on the "mail" queue, one batch at a time. It sends from the
// HR's Gmail. Each candidate is mailed at most once: invite_sent / offer_sent is set right after
// a successful send and flagged candidates are never picked again, so a retried batch only mails
// whoever is left.

/** Who sends: the HR's Gmail address and the company name their emails use. */
export interface Sender {
  email: string
  companyName: string
}

type ReportProgress = (progress: TaskProgress) => Promise<void>
const noProgress: ReportProgress = async () => {}

/** "2030-03-01" → "Friday, 1 March 2030" (the calendar day itself, whatever the server's time zone) */
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

/** 1500000 → "15,00,000" */
const amount = (v: number | null | undefined) => v == null ? '' : v.toLocaleString('en-IN', { maximumFractionDigits: 2 })

/** Numeric candidate fields as template text; {{experience_level}} keeps working for older templates. */
const candidateText = (c: { current_ctc?: number | null, offered_salary?: number | null, experience_years?: number | null }) => ({
  current_ctc: amount(c.current_ctc),
  offered_salary: amount(c.offered_salary),
  experience_level: c.experience_years == null ? '' : `${c.experience_years} years`
})

/** Spaces out sends to stay well inside Gmail's sending limits (MAIL_SEND_INTERVAL_MS). */
const pause = () => new Promise(resolve => setTimeout(resolve, config.mail.sendIntervalMs))

/** Which templates suit which mail: an invite template (or a custom one) for invites, and so on. */
const SUITS = { invite: ['invite', 'custom'], offer: ['offer', 'custom'] } as const
type MailKind = keyof typeof SUITS

const getTemplate = async (templateId: number, kind: MailKind) => {
  const template = await templatesRepository.findById(templateId)
  if (!template) throw new NotFoundError('Template')
  if (!(SUITS[kind] as readonly string[]).includes(template.type)) {
    throw new ValidationError([{ path: ['templateId'], message: `A ${template.type} template can't be sent as ${kind === 'invite' ? 'an invite' : 'an offer'}` }], 'Wrong template type')
  }
  return template
}

/** Everything a send needs that isn't in the task payload: the HR's Gmail client and sender details. */
const senderContext = async (userId: number): Promise<{ auth: GoogleAuthClient, sender: Sender }> => {
  const user = await usersRepository.findById(userId)
  if (!user) throw new NotFoundError('User')
  const companyName = await profileService.requireCompanyName(userId)
  return { auth: await googleAuthService.getAuthClientForUser(userId), sender: { email: user.email, companyName } }
}

/** Checked before queueing, so the HR hears about it at once instead of from a failed task. */
const assertCanSend = async (userId: number, templateId: number, kind: MailKind) => {
  await profileService.requireCompanyName(userId)
  await googleAuthService.getAuthClientForUser(userId)
  await getTemplate(templateId, kind)
}

const failed = (label: string, message: string, err: unknown) => {
  console.error(label, err)
  return new Error(`${message}: ${(err as Error).message}`, { cause: err })
}

/** Invites the uninvited candidates of one event. Throws if the template or event is missing. */
const sendInvitesForEvent = async (auth: GoogleAuthClient, sender: Sender, eventId: number, templateId: number, onProgress: ReportProgress) => {
  const template = await getTemplate(templateId, 'invite')

  const event = await interviewEventsRepository.findById(eventId)
  if (!event) throw new NotFoundError('Event')

  const candidates = await interviewAssignmentsRepository.listUninvitedForEvent(eventId)

  let sent = 0, failed = 0, skipped = 0

  for (const [index, candidate] of candidates.entries()) {
    await onProgress({ done: index, total: candidates.length, stage: `sending invites for event ${eventId}` })
    if (!candidate.email) {
      skipped++
      continue
    }

    try {
      const data = {
        ...candidate,
        ...candidateText(candidate),
        company_name: sender.companyName,
        interview_date: event.event_date ? longDate(event.event_date) : '',
        interview_start_time: event.start_time?.slice(0, 5) || '',
        interview_end_time: event.end_time?.slice(0, 5) || '',
        interview_mode: event.interview_mode === 'online' ? 'Online (Virtual)' : 'Offline (In-Person)',
        venue_or_link: event.venue_or_link || 'To be confirmed'
      }

      const raw = buildRawEmail(candidate.email, sender.email, renderText(template.subject, data), renderString(template.body, data))

      if (sent + failed > 0) await pause()
      await sendRawMessage(auth, raw)
      await interviewAssignmentsRepository.markInviteSent(candidate.ic_id)

      console.log(`[Mailer] ✅ Invite sent to ${candidate.name} (${candidate.email})`)
      sent++
    } catch (err) {
      console.error(`[Mailer] ❌ Failed to send to ${candidate.email}:`, (err as Error).message)
      failed++
    }
  }

  await onProgress({ done: candidates.length, total: candidates.length, stage: `sending invites for event ${eventId}` })
  return { sent, failed, skipped, total: candidates.length }
}

export const mailService = {
  // ---- enqueue (HTTP side): validate, queue, answer 202

  async enqueueEventInvites(userId: number, eventId: number, templateId: number) {
    await assertCanSend(userId, templateId, 'invite')
    if (!(await interviewEventsRepository.findById(eventId))) throw new NotFoundError('Event')
    return enqueue('mail.invites', { userId, eventId, templateId }, {
      taskId: `mail.invites.event.${eventId}`,
      conflictMessage: 'Invites for this event are already being sent'
    })
  },

  async enqueueAllInvites(userId: number, templateId: number) {
    await assertCanSend(userId, templateId, 'invite')
    return enqueue('mail.invitesAll', { userId, templateId }, {
      taskId: 'mail.invites.all',
      conflictMessage: 'Invites are already being sent'
    })
  },

  async enqueueOffers(userId: number, templateId: number, candidateIds: number[]) {
    await assertCanSend(userId, templateId, 'offer')
    return enqueue('mail.offers', { userId, templateId, candidateIds }, {
      taskId: 'mail.offers',
      conflictMessage: 'Offer letters are already being sent'
    })
  },

  // ---- run (worker side)

  /** Task mail.invites: the uninvited candidates of one event. */
  async runEventInvites(userId: number, eventId: number, templateId: number, onProgress: ReportProgress = noProgress) {
    try {
      const { auth, sender } = await senderContext(userId)
      return { message: 'Invites processed', ...await sendInvitesForEvent(auth, sender, eventId, templateId, onProgress) }
    } catch (err) {
      throw failed('[Mail] Error sending invites:', 'Failed to send invites', err)
    }
  },

  /** Task mail.invitesAll: every event that still has uninvited candidates, one after another. */
  async runAllInvites(userId: number, templateId: number, onProgress: ReportProgress = noProgress) {
    try {
      const { auth, sender } = await senderContext(userId)
      const eventIds = await interviewEventsRepository.findIdsWithUnsentInvites()

      let totalSent = 0, totalFailed = 0, totalSkipped = 0
      for (const eventId of eventIds) {
        const result = await sendInvitesForEvent(auth, sender, eventId, templateId, onProgress)
        totalSent += result.sent
        totalFailed += result.failed
        totalSkipped += result.skipped
      }

      return {
        message: 'Bulk invites processed',
        sent: totalSent, failed: totalFailed, skipped: totalSkipped,
        eventsProcessed: eventIds.length
      }
    } catch (err) {
      throw failed('[Mail] Error sending bulk invites:', 'Failed to send bulk invites', err)
    }
  },

  /** Task mail.offers: offer letters to the given candidates that are selected and haven't had one yet. */
  async runOffers(userId: number, templateId: number, candidateIds: number[], onProgress: ReportProgress = noProgress) {
    try {
      const { auth, sender } = await senderContext(userId)
      const template = await getTemplate(templateId, 'offer')
      const candidates = await candidatesRepository.findSelectedWithoutOffer(candidateIds)

      let sent = 0, failed = 0, skipped = 0

      for (const [index, candidate] of candidates.entries()) {
        await onProgress({ done: index, total: candidates.length, stage: 'sending offer letters' })
        if (!candidate.email) {
          skipped++
          continue
        }

        try {
          const data = {
            ...candidate,
            ...candidateText(candidate),
            company_name: sender.companyName,
            joining_date: candidate.joining_date ? longDate(candidate.joining_date) : ''
          }

          const raw = buildRawEmail(candidate.email, sender.email, renderText(template.subject, data), renderString(template.body, data))

          if (sent + failed > 0) await pause()
          await sendRawMessage(auth, raw)
          await candidatesRepository.markOfferSent(candidate.id)

          console.log(`[Mailer] ✅ Offer sent to ${candidate.name} (${candidate.email})`)
          sent++
        } catch (err) {
          console.error(`[Mailer] ❌ Failed to send offer to ${candidate.email}:`, (err as Error).message)
          failed++
        }
      }

      await onProgress({ done: candidates.length, total: candidates.length, stage: 'sending offer letters' })
      return { message: 'Offer letters processed', sent, failed, skipped, total: candidates.length }
    } catch (err) {
      throw failed('[Mail] Error sending offers:', 'Failed to send offers', err)
    }
  },

  unsentInviteCounts: () => interviewEventsRepository.unsentInviteCounts()
}

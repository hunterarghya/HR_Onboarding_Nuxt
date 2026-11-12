import { AppError } from '~~/server/core/errors/app-error'
import { sendRawMessage } from '~~/server/integrations/google/gmail.client'
import { buildRawEmail } from '~~/server/integrations/google/mime'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { candidatesRepository } from '../candidates/candidates.repository'
import { interviewAssignmentsRepository } from '../interviews/interview-assignments.repository'
import { interviewEventsRepository } from '../interviews/interview-events.repository'
import { renderString } from '../templates/template-renderer'
import { templatesRepository } from '../templates/templates.repository'

// Sends from the signed-in user's Gmail. Each candidate is sent at most once: the invite_sent /
// offer_sent flag is set after a successful send, and flagged candidates are not picked again.

const longDate = (d: Date) => new Date(d).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const getTemplate = async (templateId: number) => {
  const template = await templatesRepository.findById(templateId)
  if (!template) throw new Error('Template not found')
  return template
}

/** Invites the uninvited candidates of one event. Throws (plain Error) if the template or event is missing. */
const sendInvitesForEvent = async (auth: GoogleAuthClient, senderEmail: string, eventId: number, templateId: number) => {
  const template = await getTemplate(templateId)

  const event = await interviewEventsRepository.findById(eventId)
  if (!event) throw new Error('Event not found')

  const candidates = await interviewAssignmentsRepository.listUninvitedForEvent(eventId)

  let sent = 0, failed = 0, skipped = 0

  for (const candidate of candidates) {
    if (!candidate.email) {
      skipped++
      continue
    }

    try {
      const data = {
        ...candidate,
        interview_date: event.event_date ? longDate(event.event_date) : '',
        interview_start_time: event.start_time?.slice(0, 5) || '',
        interview_end_time: event.end_time?.slice(0, 5) || '',
        interview_mode: event.interview_mode === 'online' ? 'Online (Virtual)' : 'Offline (In-Person)',
        venue_or_link: event.venue_or_link || 'To be confirmed'
      }

      const raw = buildRawEmail(candidate.email, senderEmail, renderString(template.subject, data), renderString(template.body, data))

      await sendRawMessage(auth, raw)
      await interviewAssignmentsRepository.markInviteSent(candidate.ic_id)

      console.log(`[Mailer] ✅ Invite sent to ${candidate.name} (${candidate.email})`)
      sent++
    } catch (err) {
      console.error(`[Mailer] ❌ Failed to send to ${candidate.email}:`, (err as Error).message)
      failed++
    }
  }

  return { sent, failed, skipped, total: candidates.length }
}

export const mailService = {
  async sendInterviewInvites(auth: GoogleAuthClient, senderEmail: string, eventId: number, templateId: number) {
    try {
      return { message: 'Invites processed', ...await sendInvitesForEvent(auth, senderEmail, eventId, templateId) }
    } catch (err) {
      console.error('[Mail] Error sending invites:', err)
      throw new AppError(500, 'MAIL_SEND_FAILED', 'Failed to send invites', (err as Error).message)
    }
  },

  /** Every event that still has uninvited candidates, one after another. */
  async sendAllPendingInvites(auth: GoogleAuthClient, senderEmail: string, templateId: number) {
    try {
      const eventIds = await interviewEventsRepository.findIdsWithUnsentInvites()

      let totalSent = 0, totalFailed = 0, totalSkipped = 0
      for (const eventId of eventIds) {
        const result = await sendInvitesForEvent(auth, senderEmail, eventId, templateId)
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
      console.error('[Mail] Error sending bulk invites:', err)
      throw new AppError(500, 'MAIL_SEND_FAILED', 'Failed to send bulk invites', (err as Error).message)
    }
  },

  /** Offer letters to the given candidates that are selected and haven't had one yet. */
  async sendOfferLetters(auth: GoogleAuthClient, senderEmail: string, templateId: number, candidateIds: number[]) {
    try {
      const template = await getTemplate(templateId)
      const candidates = await candidatesRepository.findSelectedWithoutOffer(candidateIds)

      let sent = 0, failed = 0, skipped = 0

      for (const candidate of candidates) {
        if (!candidate.email) {
          skipped++
          continue
        }

        try {
          const data = {
            ...candidate,
            joining_date: candidate.joining_date ? longDate(candidate.joining_date) : ''
          }

          const raw = buildRawEmail(candidate.email, senderEmail, renderString(template.subject, data), renderString(template.body, data))

          await sendRawMessage(auth, raw)
          await candidatesRepository.markOfferSent(candidate.id)

          console.log(`[Mailer] ✅ Offer sent to ${candidate.name} (${candidate.email})`)
          sent++
        } catch (err) {
          console.error(`[Mailer] ❌ Failed to send offer to ${candidate.email}:`, (err as Error).message)
          failed++
        }
      }

      return { message: 'Offer letters processed', sent, failed, skipped, total: candidates.length }
    } catch (err) {
      console.error('[Mail] Error sending offers:', err)
      throw new AppError(500, 'MAIL_SEND_FAILED', 'Failed to send offers', (err as Error).message)
    }
  },

  unsentInviteCounts: () => interviewEventsRepository.unsentInviteCounts()
}

import { NotFoundError, ValidationError } from '~~/server/core/errors/app-error'
import { jobRolesRepository } from '../job-roles/job-roles.repository'
import { deleteEvent, insertEvent } from '~~/server/integrations/google/calendar.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { toCalendarEvent } from './calendar-event.mapper'
import { OPEN_ROLE, type CreateEventInput } from './interviews.dto'
import { interviewEventsRepository } from './interview-events.repository'

export const interviewEventsService = {
  list: () => interviewEventsRepository.findAll(),

  /** Saves an interview slot; unless sync_calendar is false it is also put on Google Calendar (best effort). */
  async create(auth: GoogleAuthClient, input: CreateEventInput) {
    const { sync_calendar, role: roleName, ...rest } = input
    const isOpen = roleName.toLowerCase() === OPEN_ROLE.toLowerCase()
    const job = isOpen ? null : await jobRolesRepository.findByRoleName(roleName)
    if (!isOpen && !job) {
      throw new ValidationError([{ path: ['role'], message: 'Not a current job role' }], 'Unknown job role')
    }
    const slot = { ...rest, job_role_id: job?.id ?? null, role: job?.role ?? OPEN_ROLE }

    let googleEventId: string | null = null

    if (sync_calendar) {
      try {
        const { resource, conferenceDataVersion } = toCalendarEvent({ ...slot, venue_or_link: slot.venue_or_link ?? '' })
        googleEventId = await insertEvent(auth, resource, { conferenceDataVersion })
        console.log(`--- [Calendar] Created event: ${googleEventId} ---`)
      } catch (calErr) {
        console.error('--- [Calendar] Sync failed, saving locally only:', (calErr as Error).message)
      }
    }

    return interviewEventsRepository.insert({ ...slot, google_event_id: googleEventId })
  },

  /** Deletes the slot (and its assignments). The Google Calendar copy is removed best effort. */
  async remove(auth: GoogleAuthClient, id: number) {
    const event = await interviewEventsRepository.findById(id)
    if (!event) throw new NotFoundError('Event')

    if (event.google_event_id) {
      try {
        await deleteEvent(auth, event.google_event_id)
        console.log(`--- [Calendar] Deleted event: ${event.google_event_id} ---`)
      } catch (calErr) {
        console.error(`--- [Calendar] Error deleting event ${event.google_event_id}:`, (calErr as Error).message)
      }
    }

    await interviewEventsRepository.deleteById(id)
  }
}

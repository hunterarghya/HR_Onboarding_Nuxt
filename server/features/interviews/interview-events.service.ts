import { NotFoundError, ValidationError } from '~~/server/core/errors/app-error'
import { deleteEvent, insertEvent } from '~~/server/integrations/google/calendar.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { toCalendarEvent } from './calendar-event.mapper'
import { CREATE_EVENT_MESSAGE, type CreateEventInput } from './interviews.dto'
import { interviewEventsRepository } from './interview-events.repository'

export const interviewEventsService = {
  list: () => interviewEventsRepository.findAll(),

  /** Saves an interview slot; unless sync_calendar is false it is also put on Google Calendar (best effort). */
  async create(auth: GoogleAuthClient, input: CreateEventInput) {
    const { role, event_date, start_time, end_time, num_candidates, extra_candidates, interview_mode, venue_or_link, sync_calendar } = input
    if (!role || !event_date || !start_time || !end_time) throw new ValidationError(null, CREATE_EVENT_MESSAGE)

    const mode = interview_mode || 'offline'
    let googleEventId: string | null = null

    if (sync_calendar !== false) {
      try {
        const { resource, conferenceDataVersion } = toCalendarEvent({
          role: String(role),
          event_date: String(event_date),
          start_time: String(start_time),
          end_time: String(end_time),
          num_candidates: num_candidates || 5,
          extra_candidates: extra_candidates || 0,
          interview_mode: mode,
          venue_or_link: venue_or_link || ''
        })
        googleEventId = await insertEvent(auth, resource, { conferenceDataVersion })
        console.log(`--- [Calendar] Created event: ${googleEventId} ---`)
      } catch (calErr) {
        console.error('--- [Calendar] Sync failed, saving locally only:', (calErr as Error).message)
      }
    }

    return interviewEventsRepository.insert({
      role,
      event_date,
      start_time,
      end_time,
      num_candidates: num_candidates || 5,
      extra_candidates: extra_candidates || 0,
      interview_mode: mode,
      venue_or_link: venue_or_link || null,
      google_event_id: googleEventId
    })
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

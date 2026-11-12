import type { CalendarEvent } from '~~/server/integrations/google/calendar.client'

export interface InterviewEventForCalendar {
  role: string
  event_date: string
  start_time: string
  end_time: string
  num_candidates: number | string
  extra_candidates: number | string
  interview_mode?: string
  venue_or_link?: string
}

/**
 * Builds the Google Calendar event for an interview slot: title, description, times in `timeZone`, colour,
 * and a Meet link request for online interviews without a link. conferenceDataVersion is set only
 * then, because Google needs it to create the Meet link.
 */
export const toCalendarEvent = (eventData: InterviewEventForCalendar, timeZone: string): { resource: CalendarEvent, conferenceDataVersion?: number } => {
  const startDateTime = `${eventData.event_date}T${eventData.start_time}:00`
  const endDateTime = `${eventData.event_date}T${eventData.end_time}:00`

  const extraText = Number(eventData.extra_candidates) > 0
    ? ` + ${eventData.extra_candidates} extra`
    : ''

  const mode = eventData.interview_mode || 'offline'
  const modeLabel = mode === 'online' ? 'Online (Virtual)' : 'Offline (In-Person)'
  const venueInfo = eventData.venue_or_link
    ? (mode === 'online' ? `Meet Link: ${eventData.venue_or_link}` : `Venue: ${eventData.venue_or_link}`)
    : ''

  const descriptionParts = [
    `Role: ${eventData.role}`,
    `Candidates: ${eventData.num_candidates}${extraText}`,
    `Mode: ${modeLabel}`,
    venueInfo,
    `Type: HR Interview Schedule`
  ].filter(Boolean)

  const resource: CalendarEvent = {
    summary: `Interview: ${eventData.role}`,
    description: descriptionParts.join('\n'),
    start: {
      dateTime: startDateTime,
      timeZone
    },
    end: {
      dateTime: endDateTime,
      timeZone
    },
    colorId: '9' // Blueberry
  }

  // For online interviews, request Google Meet conferencing
  if (mode === 'online' && !eventData.venue_or_link) {
    resource.conferenceData = {
      createRequest: {
        requestId: `hr-interview-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
    return { resource, conferenceDataVersion: 1 }
  }

  return { resource }
}

import { deleteEvent, insertEvent, listCalendars, listEvents, watchEvents, type CalendarEvent } from '~~/server/integrations/google/calendar.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'

// Interview-specific calendar logic. Raw Google Calendar calls live in integrations/google/calendar.client.ts.

interface EventData {
  role: string
  event_date: string
  start_time: string
  end_time: string
  num_candidates: number
  extra_candidates: number
  interview_mode?: string
  venue_or_link?: string
}

/**
 * Creates an interview event on Google Calendar.
 */
export const createCalendarEvent = async (auth: GoogleAuthClient, eventData: EventData): Promise<string> => {
  const startDateTime = `${eventData.event_date}T${eventData.start_time}:00`
  const endDateTime = `${eventData.event_date}T${eventData.end_time}:00`

  const extraText = eventData.extra_candidates > 0
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

  const event: CalendarEvent = {
    summary: `Interview: ${eventData.role}`,
    description: descriptionParts.join('\n'),
    start: {
      dateTime: startDateTime,
      timeZone: 'Asia/Kolkata'
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Asia/Kolkata'
    },
    colorId: '9' // Blueberry
  }

  // For online interviews, request Google Meet conferencing
  if (mode === 'online' && !eventData.venue_or_link) {
    event.conferenceData = {
      createRequest: {
        requestId: `hr-interview-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  }

  // conferenceDataVersion is required for Google to create the Meet link
  const eventId = await insertEvent(auth, event, event.conferenceData ? { conferenceDataVersion: 1 } : {})

  console.log(`--- [Calendar] Created event: ${eventId} ---`)
  return eventId
}

/**
 * Deletes a Google Calendar event.
 */
export const deleteCalendarEvent = async (auth: GoogleAuthClient, googleEventId: string): Promise<void> => {
  if (!googleEventId) return
  try {
    await deleteEvent(auth, googleEventId)
    console.log(`--- [Calendar] Deleted event: ${googleEventId} ---`)
  } catch (err: any) {
    console.error(`--- [Calendar] Error deleting event ${googleEventId}:`, err.message)
  }
}

/**
 * Fetches recent calendar events (last 7 days to next 60 days).
 */
export const fetchRecentCalendarEvents = async (auth: GoogleAuthClient) => {
  // Debug: List all calendars first to see what we have access to
  try {
    const calendars = await listCalendars(auth)
    console.log(`[Calendar Fetch] Available Calendars for this user:`)
    calendars.forEach((cal: any) => {
      console.log(`[Calendar Fetch] - Name: "${cal.summary}" | ID: ${cal.id} | Primary: ${cal.primary || false} | Access: ${cal.accessRole}`)
    })
  } catch (err: any) {
    console.error(`[Calendar Fetch] ❌ Could not fetch calendar list:`, err.message)
  }

  const timeMin = new Date()
  timeMin.setDate(timeMin.getDate() - 7)
  const timeMax = new Date()
  timeMax.setDate(timeMax.getDate() + 60)

  console.log(`[Calendar Fetch] Querying Google Calendar API (primary)...`)
  console.log(`[Calendar Fetch] Time range: ${timeMin.toISOString()} → ${timeMax.toISOString()}`)

  const items = await listEvents(auth, timeMin, timeMax)
  console.log(`[Calendar Fetch] ✅ API returned ${items.length} events from primary calendar`)

  return items
}

/**
 * Registers a webhook (watch) on the primary calendar for push notifications.
 */
export const registerCalendarWebhook = async (auth: GoogleAuthClient, webhookUrl: string) => {
  const channelId = `hr-interview-${Date.now()}`
  const data = await watchEvents(auth, channelId, webhookUrl)

  console.log(`--- [Calendar] Webhook registered: ${channelId} ---`)
  return data
}

import { z } from 'zod'
import type { CalendarEvent } from '~~/server/integrations/google/calendar.client'
import { llmFlag } from '../llm-json'

// Deterministic clean-up of the model's extraction: role reconciliation, date and times (from Google's own
// timestamps when the event has them), interview mode and venue. No LLM here, so it is unit-tested directly.

/**
 * The JSON the model is asked to return (see calendar-event.prompt.ts). is_activity must be a yes/no;
 * any other field the model gets wrong is dropped and filled from the calendar event or a default.
 */
export const CalendarExtractionSchema = z.object({
  is_activity: llmFlag,
  matched_role: z.string().max(255).nullish().catch(null),
  date: z.iso.date().optional().catch(undefined),
  start_time: z.string().nullish().catch(null),
  end_time: z.string().nullish().catch(null),
  num_candidates: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
  interview_mode: z.enum(['online', 'offline']).optional().catch(undefined),
  venue_or_link: z.string().max(2000).optional().catch(undefined)
})

export type CalendarExtraction = z.output<typeof CalendarExtractionSchema>

export interface InterviewEventDraft {
  role: string
  event_date: string
  start_time: string
  end_time: string
  num_candidates: number
  extra_candidates: number
  interview_mode: string
  venue_or_link: string
  google_event_id: string
}

/**
 * An instant as the date and wall-clock time in `timeZone`, whatever offset it was written with:
 * "2030-01-15T22:30:00Z" in Asia/Kolkata → { date: "2030-01-16", time: "04:00" }. Null if unreadable.
 */
export const toLocalDateTime = (isoDateTime: string, timeZone: string): { date: string, time: string } | null => {
  const instant = new Date(isoDateTime)
  if (Number.isNaN(instant.getTime())) return null
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(instant).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

/** "HH:MM" plus some minutes, kept within the same day (at most 23:59). */
const addMinutesSameDay = (time: string, minutes: number) => {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export const sanitizeTime = (timeStr: string | undefined | null): string | null => {
  if (!timeStr || typeof timeStr !== 'string') return null
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = parseInt(match[1]!), m = parseInt(match[2]!)
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Turns the model's checked answer (is_activity true) into an interview event in `timeZone`, or null to skip.
 * A timed event's date and times come from Google's timestamps (BUG-02: the model's reading, plus a fixed
 * +5:30, was wrong for any calendar not in UTC). An all-day event takes its times from the model, which
 * reads them from the title or description.
 */
export const normalizeCalendarExtraction = (calendarEvent: CalendarEvent, activeRoles: string[], result: CalendarExtraction, timeZone: string): InterviewEventDraft | null => {
  const summary = calendarEvent.summary || ''
  const description = calendarEvent.description || ''

  let finalRole: string | null = null
  const matchedRole = result.matched_role
  if (matchedRole) {
    finalRole = activeRoles.find(r => r.toLowerCase() === matchedRole.toLowerCase()) || null
    if (!finalRole && matchedRole.toLowerCase() === 'open role') finalRole = 'Open Role'
    if (!finalRole) {
      console.log(`[CalendarAgent] Role "${matchedRole}" not in active list. Attempting partial match...`)
      finalRole = activeRoles.find(r => summary.toLowerCase().includes(r.toLowerCase())) || null
    }
  }

  if (!finalRole) {
    const lowerSummary = summary.toLowerCase()
    const lowerDesc = description.toLowerCase()
    const interviewKeywords = ['interview', 'hiring', 'recruit', 'candidate', 'screening', 'assessment']
    const hasInterviewKeyword = interviewKeywords.some(kw => lowerSummary.includes(kw) || lowerDesc.includes(kw))
    if (hasInterviewKeyword || result.is_activity) {
      finalRole = 'Open Role'
      console.log(`[CalendarAgent] No specific role matched. Defaulting to "Open Role".`)
    } else {
      console.log(`[CalendarAgent] ❌ Not an interview event. Skipping.`)
      return null
    }
  }

  const start = calendarEvent.start?.dateTime ? toLocalDateTime(calendarEvent.start.dateTime, timeZone) : null
  const end = calendarEvent.end?.dateTime ? toLocalDateTime(calendarEvent.end.dateTime, timeZone) : null

  let eventDate: string | null | undefined
  let startTime: string | null
  let endTime: string | null
  if (start) {
    eventDate = start.date
    startTime = start.time
    // an event running past midnight ends at the default below instead
    endTime = end && end.date === start.date ? end.time : null
  } else {
    eventDate = calendarEvent.start?.date ?? result.date
    startTime = sanitizeTime(result.start_time)
    endTime = sanitizeTime(result.end_time)
  }

  if (!eventDate) {
    console.log(`[CalendarAgent] ❌ No date for the event. Skipping.`)
    return null
  }
  if (!startTime) {
    console.log(`[CalendarAgent] ❌ Could not determine a valid start time. Skipping.`)
    return null
  }
  if (!endTime || endTime <= startTime) {
    endTime = addMinutesSameDay(startTime, 240)
    console.log(`[CalendarAgent] End time missing/invalid. Defaulting to ${endTime} (start + 4h, same day)`)
  }

  const googleMeetLink = calendarEvent.hangoutLink || calendarEvent.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || ''
  const calendarLocation = calendarEvent.location || ''

  let interviewMode = result.interview_mode || 'offline'
  let venueOrLink = result.venue_or_link || ''

  if (googleMeetLink) {
    interviewMode = 'online'
    if (!venueOrLink) venueOrLink = googleMeetLink
  } else if (calendarLocation && !venueOrLink) {
    interviewMode = 'offline'
    venueOrLink = calendarLocation
  }

  const finalResult: InterviewEventDraft = {
    role: finalRole,
    event_date: eventDate,
    start_time: startTime,
    end_time: endTime,
    num_candidates: result.num_candidates ?? 5,
    extra_candidates: 0,
    interview_mode: interviewMode,
    venue_or_link: venueOrLink,
    google_event_id: calendarEvent.id!
  }

  console.log(`[CalendarAgent] ✅ SUCCESS: ${finalRole}`)
  console.log(`[CalendarAgent] 🕒 ${eventDate} ${startTime}–${endTime} (${timeZone})`)
  console.log(`[CalendarAgent] 👥 Candidates: ${finalResult.num_candidates}`)
  console.log(`[CalendarAgent] 📍 Mode: ${interviewMode} | Venue/Link: ${venueOrLink || '(none)'}`)
  return finalResult
}

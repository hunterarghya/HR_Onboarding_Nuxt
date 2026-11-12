import { z } from 'zod'
import type { CalendarEvent } from '~~/server/integrations/google/calendar.client'
import { llmFlag } from '../llm-json'

// Deterministic clean-up of the model's extraction: role reconciliation, time fallback and the
// UTC→IST shift, interview mode and venue. No LLM here, so it is unit-tested directly.

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

// BUG-02 (kept as-is in this move): always adds +5:30, even when Google already returned IST
export const convertToIST = (timeStr: string): string => {
  if (!timeStr || !timeStr.includes(':')) return timeStr
  const [h = 0, m = 0] = timeStr.split(':').map(Number)
  let totalMinutes = h * 60 + m + (5 * 60 + 30)
  totalMinutes = totalMinutes % (24 * 60)
  const newH = Math.floor(totalMinutes / 60)
  const newM = totalMinutes % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

export const sanitizeTime = (timeStr: string | undefined | null): string | null => {
  if (!timeStr || typeof timeStr !== 'string') return null
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = parseInt(match[1]!), m = parseInt(match[2]!)
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Turns the model's checked answer (is_activity true, with a date) into an interview event, or null to skip. */
export const normalizeCalendarExtraction = (calendarEvent: CalendarEvent, activeRoles: string[], result: CalendarExtraction & { date: string }): InterviewEventDraft | null => {
  const summary = calendarEvent.summary || ''
  const description = calendarEvent.description || ''
  const startDateTime = calendarEvent.start?.dateTime || calendarEvent.start?.date || ''
  const endDateTime = calendarEvent.end?.dateTime || calendarEvent.end?.date || ''

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

  let startTime = sanitizeTime(result.start_time)
  let endTime = sanitizeTime(result.end_time)

  if (!startTime && startDateTime.includes('T')) {
    startTime = sanitizeTime(startDateTime.split('T')[1]?.substring(0, 5))
  }
  if (!endTime && endDateTime.includes('T')) {
    endTime = sanitizeTime(endDateTime.split('T')[1]?.substring(0, 5))
  }
  if (!startTime) {
    console.log(`[CalendarAgent] ❌ Could not determine a valid start time. Skipping.`)
    return null
  }
  if (!endTime) {
    const [sh = 0, sm = 0] = startTime.split(':').map(Number)
    const endMinutes = (sh * 60 + sm + 240) % (24 * 60)
    endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
    console.log(`[CalendarAgent] End time missing/invalid. Defaulting to ${endTime} (start + 4h)`)
  }

  const istStart = convertToIST(startTime)
  const istEnd = convertToIST(endTime)

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
    event_date: result.date,
    start_time: istStart,
    end_time: istEnd,
    num_candidates: result.num_candidates ?? 5,
    extra_candidates: 0,
    interview_mode: interviewMode,
    venue_or_link: venueOrLink,
    google_event_id: calendarEvent.id!
  }

  console.log(`[CalendarAgent] ✅ SUCCESS: ${finalRole}`)
  console.log(`[CalendarAgent] 🕒 Conversion: UTC ${startTime} -> IST ${istStart}`)
  console.log(`[CalendarAgent] 👥 Candidates: ${finalResult.num_candidates}`)
  console.log(`[CalendarAgent] 📍 Mode: ${interviewMode} | Venue/Link: ${venueOrLink || '(none)'}`)
  return finalResult
}

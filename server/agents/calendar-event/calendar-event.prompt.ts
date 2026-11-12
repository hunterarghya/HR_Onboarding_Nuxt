import type { CalendarEvent } from '~~/server/integrations/google/calendar.client'

/** Asks the model to extract an interview slot from a calendar event. Must mention JSON (Groq JSON mode needs it). */
export const buildCalendarEventPrompt = (calendarEvent: CalendarEvent, activeRoles: string[]): string => {
  const summary = calendarEvent.summary || ''
  const description = calendarEvent.description || ''
  const startDateTime = calendarEvent.start?.dateTime || calendarEvent.start?.date || ''
  const endDateTime = calendarEvent.end?.dateTime || calendarEvent.end?.date || ''

  return `
    You are an HR assistant. Analyze this Google Calendar event. Identify if this event is related to a job role, interview, or a hiring activity.
    
    Event Title: ${summary}
    Description: ${description}
    Event Time: ${startDateTime} to ${endDateTime}
    Location: ${calendarEvent.location || 'Not specified'}
    Conference/Meet Link: ${calendarEvent.hangoutLink || calendarEvent.conferenceData?.entryPoints?.[0]?.uri || 'None'}

    Active Role List:
    ${activeRoles.join(', ')}

    Tasks:
    1. Identify if this event is related to a job role or hiring activity. 
    2. Role Matching: Find the most similar role from the Active Role List. Even if there are typos, missing words, or capitalization differences (e.g., "ui dev" matches "UI Developer"), you MUST return the exact role name from the list.
    3. If the event IS an interview/hiring activity but NO role from the list matches, return matched_role as "Open Role".
    4. If the event is NOT related to interviews or hiring at all, return is_activity=false.
    5. Extract the date (YYYY-MM-DD).
    6. Extract the start_time and end_time (HH:MM, 24-hour) of the interview. If the event time above has no time of day (an all-day event), take them from the title or description; return null if none is stated. Never return text like "TBC" or "N/A".
    7. Candidate Count: Look for ANY number associated with candidates. If no number is found, return 5 as default.
    8. Interview Mode: If the event has a Google Meet link, conference data, or mentions "online"/"virtual"/"remote", return "online". Otherwise return "offline".
    9. Venue or Link: If online return the URL, if offline return the address, if not found return empty string.

    Return ONLY JSON:
    {
      "is_activity": true,
      "matched_role": "Exact Role Name from List or Open Role",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "num_candidates": 5,
      "interview_mode": "online" or "offline",
      "venue_or_link": "URL or physical address or empty string"
    }
  `
}

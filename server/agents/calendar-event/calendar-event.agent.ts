import type { CalendarEvent } from '~~/server/integrations/google/calendar.client'
import { getLlm, type LlmProvider } from '~~/server/integrations/llm'
import { normalizeCalendarExtraction, type InterviewEventDraft } from './calendar-event.normalizer'
import { buildCalendarEventPrompt } from './calendar-event.prompt'

/**
 * Asks the LLM whether a calendar event is an interview and, if so, returns it as an
 * interview event draft. Returns null for non-interviews and on any model or parsing failure.
 */
export const extractInterviewEvent = async (calendarEvent: CalendarEvent, activeRoles: string[], llm: LlmProvider = getLlm()): Promise<InterviewEventDraft | null> => {
  const summary = calendarEvent.summary || ''
  const description = calendarEvent.description || ''
  const startDateTime = calendarEvent.start?.dateTime || calendarEvent.start?.date || ''
  const endDateTime = calendarEvent.end?.dateTime || calendarEvent.end?.date || ''

  console.log(`\n========== [CalendarAgent] PROCESSING EVENT ==========`)
  console.log(`[CalendarAgent] Event ID: ${calendarEvent.id}`)
  console.log(`[CalendarAgent] Summary/Title: "${summary}"`)
  console.log(`[CalendarAgent] Description: "${description}"`)
  console.log(`[CalendarAgent] Start (UTC): ${startDateTime}`)
  console.log(`[CalendarAgent] End (UTC): ${endDateTime}`)
  console.log(`[CalendarAgent] Active roles to match: [${activeRoles.join(', ')}]`)

  const prompt = buildCalendarEventPrompt(calendarEvent, activeRoles)

  console.log(`[CalendarAgent] Sending prompt to ${llm.name} (${llm.model})...`)

  try {
    const raw = await llm.generateJson(prompt)

    console.log(`[CalendarAgent] Raw ${llm.name} response: "${raw}"`)

    let result: any
    try {
      result = JSON.parse(raw)
      console.log(`[CalendarAgent] Parsed JSON:`, JSON.stringify(result, null, 2))
    } catch (parseErr: any) {
      console.error(`[CalendarAgent] ❌ JSON Parse Failure: ${parseErr.message}`)
      return null
    }

    if (!result.is_activity) {
      console.log(`[CalendarAgent] ⏭️ SKIPPED: Agent said is_activity=false`)
      return null
    }

    return normalizeCalendarExtraction(calendarEvent, activeRoles, result)
  } catch (err: any) {
    console.error(`[CalendarAgent] ❌ Error calling ${llm.name}:`, err.message)
    return null
  }
}

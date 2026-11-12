import type { CalendarEvent } from '~~/server/integrations/google/calendar.client'

export interface ImportedEventRef {
  id: number
  google_event_id: string
}

/**
 * What a sync changes locally, given the events already imported and what Google returned for the window.
 * - Google says an event was cancelled → our copy (and its candidate places) is deleted.
 * - A live event we haven't imported → it goes to the AI agent for import.
 * Nothing else is deleted: an event simply outside the fetched window is left alone (BUG-01).
 */
export const planCalendarSync = (existing: ImportedEventRef[], calendarEvents: CalendarEvent[]) => {
  const localIdByGoogleId = new Map(existing.map(r => [r.google_event_id, r.id]))

  const toDelete = calendarEvents
    .filter(e => e.status === 'cancelled' && e.id && localIdByGoogleId.has(e.id))
    .map(e => ({ id: localIdByGoogleId.get(e.id!)!, googleEventId: e.id! }))
  const live = calendarEvents.filter(e => e.status !== 'cancelled' && e.id)
  const toImport = live.filter(e => !localIdByGoogleId.has(e.id!))

  return { toDelete, toImport, alreadyImported: live.length - toImport.length }
}

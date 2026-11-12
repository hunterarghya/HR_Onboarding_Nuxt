import { google, type calendar_v3 } from 'googleapis'
import type { GoogleAuthClient } from './oauth'

const calendarFor = (auth: GoogleAuthClient) => google.calendar({ version: 'v3', auth })

export type CalendarEvent = calendar_v3.Schema$Event

/** Creates an event on the primary calendar and returns its id. */
export const insertEvent = async (
  auth: GoogleAuthClient,
  resource: CalendarEvent,
  opts: { conferenceDataVersion?: number } = {}
): Promise<string> => {
  const response = await calendarFor(auth).events.insert({
    calendarId: 'primary',
    requestBody: resource,
    ...(opts.conferenceDataVersion !== undefined ? { conferenceDataVersion: opts.conferenceDataVersion } : {})
  })
  return response.data.id!
}

export const deleteEvent = async (auth: GoogleAuthClient, eventId: string): Promise<void> => {
  await calendarFor(auth).events.delete({ calendarId: 'primary', eventId })
}

/**
 * Single (expanded) events on the primary calendar between two instants, by start time, every page.
 * Cancelled events are included (status "cancelled"), so callers can tell "deleted in Google" from
 * "not in this window".
 */
export const listEvents = async (auth: GoogleAuthClient, timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> => {
  const items: CalendarEvent[] = []
  let pageToken: string | undefined
  do {
    const response = await calendarFor(auth).events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 250,
      singleEvents: true,
      showDeleted: true,
      orderBy: 'startTime',
      pageToken
    })
    items.push(...(response.data.items || []))
    pageToken = response.data.nextPageToken || undefined
  } while (pageToken)
  return items
}

/**
 * Subscribes `address` to push notifications for the primary calendar. Google sends `token` back with
 * every notification. Returns Google's id for the watched resource and when the channel expires.
 */
export const watchEvents = async (auth: GoogleAuthClient, channelId: string, address: string, token: string) => {
  const response = await calendarFor(auth).events.watch({
    calendarId: 'primary',
    requestBody: { id: channelId, type: 'web_hook', address, token }
  })
  return {
    resourceId: response.data.resourceId!,
    // milliseconds since the epoch, as a string; Google's default lifetime is a week
    expiresAt: new Date(Number(response.data.expiration) || Date.now() + 7 * 24 * 3600 * 1000)
  }
}

/** Stops a push channel. */
export const stopChannel = async (auth: GoogleAuthClient, channelId: string, resourceId: string) => {
  await calendarFor(auth).channels.stop({ requestBody: { id: channelId, resourceId } })
}

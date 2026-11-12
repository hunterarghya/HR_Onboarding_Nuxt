import { describe, expect, it } from 'vitest'
import { toCalendarEvent } from '../../server/features/interviews/calendar-event.mapper'

const slot = {
  role: 'Backend Developer',
  event_date: '2030-05-01',
  start_time: '10:00',
  end_time: '12:00',
  num_candidates: 5,
  extra_candidates: 2
}

describe('toCalendarEvent', () => {
  it('builds the title, description and times (in the configured zone) of an offline slot', () => {
    const { resource, conferenceDataVersion } = toCalendarEvent({ ...slot, interview_mode: 'offline', venue_or_link: 'Office, Noida' }, 'Asia/Kolkata')
    expect(conferenceDataVersion).toBeUndefined()
    expect(resource).toEqual({
      summary: 'Interview: Backend Developer',
      description: 'Role: Backend Developer\nCandidates: 5 + 2 extra\nMode: Offline (In-Person)\nVenue: Office, Noida\nType: HR Interview Schedule',
      start: { dateTime: '2030-05-01T10:00:00', timeZone: 'Asia/Kolkata' },
      end: { dateTime: '2030-05-01T12:00:00', timeZone: 'Asia/Kolkata' },
      colorId: '9'
    })
  })

  it('requests a Meet link for an online slot without one', () => {
    const { resource, conferenceDataVersion } = toCalendarEvent({ ...slot, extra_candidates: 0, interview_mode: 'online', venue_or_link: '' }, 'Asia/Kolkata')
    expect(conferenceDataVersion).toBe(1)
    expect(resource.conferenceData?.createRequest?.conferenceSolutionKey).toEqual({ type: 'hangoutsMeet' })
    expect(resource.description).toBe('Role: Backend Developer\nCandidates: 5\nMode: Online (Virtual)\nType: HR Interview Schedule')
  })

  it('keeps an existing online link instead of requesting one', () => {
    const { resource, conferenceDataVersion } = toCalendarEvent({ ...slot, interview_mode: 'online', venue_or_link: 'https://meet.google.com/abc' }, 'Europe/London')
    expect(conferenceDataVersion).toBeUndefined()
    expect(resource.conferenceData).toBeUndefined()
    expect(resource.description).toContain('Meet Link: https://meet.google.com/abc')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { extractInterviewEvent } from '../../server/agents/calendar-event/calendar-event.agent'
import { normalizeCalendarExtraction, sanitizeTime, toLocalDateTime } from '../../server/agents/calendar-event/calendar-event.normalizer'
import { classifyEmail } from '../../server/agents/email-classifier/email-classifier.agent'
import type { LlmProvider } from '../../server/integrations/llm'

// Agents run against a scripted provider: what matters here is the decision logic, not the model.
const fakeLlm = (reply: string | Error): LlmProvider & { prompts: string[] } => {
  const prompts: string[] = []
  return {
    name: 'ollama',
    model: 'fake',
    prompts,
    ping: vi.fn(async () => {}),
    listModels: vi.fn(async () => []),
    generateJson: vi.fn(async (prompt: string) => {
      prompts.push(prompt)
      if (reply instanceof Error) throw reply
      return reply
    })
  }
}

vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

const ROLES = ['Backend Developer', 'UI Developer']

describe('classifyEmail', () => {
  it('returns the model decision and puts subject and body in a JSON prompt', async () => {
    const llm = fakeLlm('{"isApplication": true, "position": "Backend Developer"}')
    await expect(classifyEmail('Application', 'resume attached', llm)).resolves.toEqual({ isApplication: true, position: 'Backend Developer' })
    expect(llm.prompts[0]).toContain('Subject: Application')
    expect(llm.prompts[0]).toContain('Body: resume attached')
    expect(llm.prompts[0]).toMatch(/JSON/)
  })

  it('falls back to "not an application" on bad JSON or a provider error', async () => {
    await expect(classifyEmail('s', 'b', fakeLlm('not json'))).resolves.toEqual({ isApplication: false, position: null })
    await expect(classifyEmail('s', 'b', fakeLlm(new Error('timed out')))).resolves.toEqual({ isApplication: false, position: null })
  })

  it('reads a "false" string as no (it used to count as an application)', async () => {
    await expect(classifyEmail('s', 'b', fakeLlm('{"isApplication": "false", "position": null}'))).resolves.toEqual({ isApplication: false, position: null })
    await expect(classifyEmail('s', 'b', fakeLlm('{"isApplication": "true"}'))).resolves.toEqual({ isApplication: true, position: null })
  })

  it('treats an answer of the wrong shape as "not an application", and drops an odd position', async () => {
    await expect(classifyEmail('s', 'b', fakeLlm('{"isApplication": "maybe"}'))).resolves.toEqual({ isApplication: false, position: null })
    await expect(classifyEmail('s', 'b', fakeLlm('[1, 2]'))).resolves.toEqual({ isApplication: false, position: null })
    await expect(classifyEmail('s', 'b', fakeLlm('{"isApplication": true, "position": 42}'))).resolves.toEqual({ isApplication: true, position: null })
  })
})

describe('calendar-event normalizer', () => {
  const TZ = 'Asia/Kolkata'
  const event = (over: Record<string, unknown> = {}) => ({
    id: 'g-1',
    summary: 'Interview: backend developer',
    description: '',
    start: { dateTime: '2030-01-15T04:30:00Z' },
    end: { dateTime: '2030-01-15T07:30:00Z' },
    ...over
  })
  const base = { is_activity: true, matched_role: 'backend developer', date: '2030-01-15', start_time: '04:30', end_time: '07:30', num_candidates: 3 }

  it('reconciles the role case-insensitively and gives the times in the configured zone', () => {
    expect(normalizeCalendarExtraction(event(), ROLES, base, TZ)).toEqual({
      role: 'Backend Developer',
      event_date: '2030-01-15',
      start_time: '10:00',
      end_time: '13:00',
      num_candidates: 3,
      extra_candidates: 0,
      interview_mode: 'offline',
      venue_or_link: '',
      google_event_id: 'g-1'
    })
  })

  it('reads an event already in Indian time without shifting it again (BUG-02: 14:00 became 19:30)', () => {
    const r = normalizeCalendarExtraction(event({ start: { dateTime: '2030-05-06T14:00:00+05:30' }, end: { dateTime: '2030-05-06T16:00:00+05:30' } }),
      ROLES, { ...base, start_time: '14:00', end_time: '16:00' }, TZ)!
    expect([r.event_date, r.start_time, r.end_time]).toEqual(['2030-05-06', '14:00', '16:00'])
  })

  it('moves to the next day when the shift crosses midnight (BUG-02: the date stayed behind)', () => {
    const r = normalizeCalendarExtraction(event({ start: { dateTime: '2030-01-15T22:30:00Z' }, end: { dateTime: '2030-01-15T23:30:00Z' } }), ROLES, base, TZ)!
    expect([r.event_date, r.start_time, r.end_time]).toEqual(['2030-01-16', '04:00', '05:00'])
  })

  it('uses Google\'s times over the model\'s reading, in any configured zone', () => {
    const r = normalizeCalendarExtraction(event(), ROLES, { ...base, date: '1999-01-01', start_time: '23:00' }, 'Europe/London')!
    expect([r.event_date, r.start_time, r.end_time]).toEqual(['2030-01-15', '04:30', '07:30'])
  })

  it('takes an all-day event\'s times from the model, unshifted', () => {
    const r = normalizeCalendarExtraction(event({ start: { date: '2030-01-20' }, end: { date: '2030-01-21' } }), ROLES, { ...base, start_time: '11:00', end_time: '12:30' }, TZ)!
    expect([r.event_date, r.start_time, r.end_time]).toEqual(['2030-01-20', '11:00', '12:30'])
  })

  it('defaults a missing end to start + 4h, never past midnight', () => {
    const allDay = { start: { date: '2030-01-20' }, end: { date: '2030-01-21' } }
    expect(normalizeCalendarExtraction(event(allDay), ROLES, { ...base, start_time: '10:00', end_time: null }, TZ)!.end_time).toBe('14:00')
    expect(normalizeCalendarExtraction(event(allDay), ROLES, { ...base, start_time: '21:00', end_time: 'TBC' }, TZ)!.end_time).toBe('23:59')
  })

  it('skips when no start time or no date can be found', () => {
    expect(normalizeCalendarExtraction(event({ start: { date: '2030-01-15' } }), ROLES, { ...base, start_time: 'N/A' }, TZ)).toBeNull()
    expect(normalizeCalendarExtraction(event({ start: {} }), ROLES, { ...base, date: undefined }, TZ)).toBeNull()
  })

  it('falls back to a role named in the title, then to "Open Role"', () => {
    expect(normalizeCalendarExtraction(event({ summary: 'UI Developer round' }), ROLES, { ...base, matched_role: 'frontend' }, TZ)!.role).toBe('UI Developer')
    expect(normalizeCalendarExtraction(event({ summary: 'Screening' }), ROLES, { ...base, matched_role: 'Data Scientist' }, TZ)!.role).toBe('Open Role')
    expect(normalizeCalendarExtraction(event(), ROLES, { ...base, matched_role: 'open role' }, TZ)!.role).toBe('Open Role')
  })

  it('prefers a Meet link (online), else the calendar location (offline)', () => {
    const online = normalizeCalendarExtraction(event({ hangoutLink: 'https://meet.google.com/abc' }), ROLES, base, TZ)!
    expect([online.interview_mode, online.venue_or_link]).toEqual(['online', 'https://meet.google.com/abc'])
    const offline = normalizeCalendarExtraction(event({ location: 'Office, Noida' }), ROLES, { ...base, interview_mode: 'online' }, TZ)!
    expect([offline.interview_mode, offline.venue_or_link]).toEqual(['offline', 'Office, Noida'])
  })

  it('defaults the candidate count to 5', () => {
    expect(normalizeCalendarExtraction(event(), ROLES, { ...base, num_candidates: undefined }, TZ)!.num_candidates).toBe(5)
  })

  it('validates times and converts instants', () => {
    expect(sanitizeTime('9:05')).toBe('09:05')
    expect(sanitizeTime('24:00')).toBeNull()
    expect(toLocalDateTime('2030-01-15T20:00:00Z', TZ)).toEqual({ date: '2030-01-16', time: '01:30' })
    expect(toLocalDateTime('not a time', TZ)).toBeNull()
  })
})

describe('extractInterviewEvent', () => {
  const TZ = 'Asia/Kolkata'
  const calEvent = { id: 'g-2', summary: 'Interview: UI Developer', start: { dateTime: '2030-02-01T05:00:00Z' }, end: { dateTime: '2030-02-01T06:00:00Z' } }

  it('sends the roles and event to the model and normalizes the answer', async () => {
    const llm = fakeLlm('{"is_activity":true,"matched_role":"UI Developer","date":"2030-02-01","start_time":"05:00","end_time":"06:00","num_candidates":4,"interview_mode":"offline","venue_or_link":""}')
    const draft = await extractInterviewEvent(calEvent, ROLES, TZ, llm)
    expect(draft).toMatchObject({ role: 'UI Developer', event_date: '2030-02-01', start_time: '10:30', end_time: '11:30', num_candidates: 4, google_event_id: 'g-2' })
    expect(llm.prompts[0]).toContain('Backend Developer, UI Developer')
    expect(llm.prompts[0]).toContain('Event Title: Interview: UI Developer')
  })

  it('returns null for non-interviews, bad JSON and provider errors', async () => {
    await expect(extractInterviewEvent(calEvent, ROLES, TZ, fakeLlm('{"is_activity":false}'))).resolves.toBeNull()
    await expect(extractInterviewEvent(calEvent, ROLES, TZ, fakeLlm('{"is_activity":"false","date":"2030-02-01"}'))).resolves.toBeNull()
    await expect(extractInterviewEvent(calEvent, ROLES, TZ, fakeLlm('{oops'))).resolves.toBeNull()
    await expect(extractInterviewEvent(calEvent, ROLES, TZ, fakeLlm(new Error('HTTP 500')))).resolves.toBeNull()
  })

  it('does not need the model\'s date for a timed event, but skips an event with no date at all', async () => {
    await expect(extractInterviewEvent(calEvent, ROLES, TZ, fakeLlm('{"is_activity":true,"date":"next Tuesday"}'))).resolves.toMatchObject({ event_date: '2030-02-01' })
    await expect(extractInterviewEvent({ id: 'g-3', summary: 'Interview' }, ROLES, TZ, fakeLlm('{"is_activity":true,"start_time":"05:00"}'))).resolves.toBeNull()
  })

  it('drops fields the model got wrong and falls back to defaults', async () => {
    const llm = fakeLlm('{"is_activity":true,"matched_role":"UI Developer","date":"2030-02-01","start_time":"05:00","end_time":"06:00","num_candidates":"lots","interview_mode":"hybrid","venue_or_link":7}')
    const draft = await extractInterviewEvent(calEvent, ROLES, TZ, llm)
    expect(draft).toMatchObject({ num_candidates: 5, interview_mode: 'offline', venue_or_link: '' })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { extractInterviewEvent } from '../../server/agents/calendar-event/calendar-event.agent'
import { convertToIST, normalizeCalendarExtraction, sanitizeTime } from '../../server/agents/calendar-event/calendar-event.normalizer'
import { classifyEmail } from '../../server/agents/email-classifier/email-classifier.agent'
import type { LlmProvider } from '../../server/integrations/llm'

// Agents run against a scripted provider: what matters here is the decision logic, not the model.
const fakeLlm = (reply: string | Error): LlmProvider & { prompts: string[] } => {
  const prompts: string[] = []
  return {
    name: 'ollama',
    model: 'fake',
    prompts,
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
})

describe('calendar-event normalizer', () => {
  const event = (over: Record<string, unknown> = {}) => ({
    id: 'g-1',
    summary: 'Interview: backend developer',
    description: '',
    start: { dateTime: '2030-01-15T04:30:00Z' },
    end: { dateTime: '2030-01-15T07:30:00Z' },
    ...over
  })
  const base = { is_activity: true, matched_role: 'backend developer', date: '2030-01-15', start_time: '04:30', end_time: '07:30', num_candidates: '3' }

  it('reconciles the role case-insensitively and shifts times by +5:30 (BUG-02, unchanged)', () => {
    expect(normalizeCalendarExtraction(event(), ROLES, base)).toEqual({
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

  it('falls back to a role named in the title, then to "Open Role"', () => {
    expect(normalizeCalendarExtraction(event({ summary: 'UI Developer round' }), ROLES, { ...base, matched_role: 'frontend' })!.role).toBe('UI Developer')
    expect(normalizeCalendarExtraction(event({ summary: 'Screening' }), ROLES, { ...base, matched_role: 'Data Scientist' })!.role).toBe('Open Role')
    expect(normalizeCalendarExtraction(event(), ROLES, { ...base, matched_role: 'open role' })!.role).toBe('Open Role')
  })

  it('takes times from the event when the model gives none, and defaults the end to start + 4h', () => {
    const r = normalizeCalendarExtraction(event({ end: { date: '2030-01-15' } }), ROLES, { ...base, start_time: 'TBC', end_time: null })!
    expect([r.start_time, r.end_time]).toEqual(['10:00', '14:00'])
  })

  it('skips when no start time can be found', () => {
    expect(normalizeCalendarExtraction(event({ start: { date: '2030-01-15' } }), ROLES, { ...base, start_time: 'N/A' })).toBeNull()
  })

  it('prefers a Meet link (online), else the calendar location (offline)', () => {
    const online = normalizeCalendarExtraction(event({ hangoutLink: 'https://meet.google.com/abc' }), ROLES, base)!
    expect([online.interview_mode, online.venue_or_link]).toEqual(['online', 'https://meet.google.com/abc'])
    const offline = normalizeCalendarExtraction(event({ location: 'Office, Noida' }), ROLES, { ...base, interview_mode: 'online' })!
    expect([offline.interview_mode, offline.venue_or_link]).toEqual(['offline', 'Office, Noida'])
  })

  it('defaults the candidate count to 5', () => {
    expect(normalizeCalendarExtraction(event(), ROLES, { ...base, num_candidates: 'many' })!.num_candidates).toBe(5)
  })

  it('validates and converts times', () => {
    expect(sanitizeTime('9:05')).toBe('09:05')
    expect(sanitizeTime('24:00')).toBeNull()
    expect(convertToIST('20:00')).toBe('01:30')
  })
})

describe('extractInterviewEvent', () => {
  const calEvent = { id: 'g-2', summary: 'Interview: UI Developer', start: { dateTime: '2030-02-01T05:00:00Z' }, end: { dateTime: '2030-02-01T06:00:00Z' } }

  it('sends the roles and event to the model and normalizes the answer', async () => {
    const llm = fakeLlm('{"is_activity":true,"matched_role":"UI Developer","date":"2030-02-01","start_time":"05:00","end_time":"06:00","num_candidates":4,"interview_mode":"offline","venue_or_link":""}')
    const draft = await extractInterviewEvent(calEvent, ROLES, llm)
    expect(draft).toMatchObject({ role: 'UI Developer', start_time: '10:30', end_time: '11:30', num_candidates: 4, google_event_id: 'g-2' })
    expect(llm.prompts[0]).toContain('Backend Developer, UI Developer')
    expect(llm.prompts[0]).toContain('Event Title: Interview: UI Developer')
  })

  it('returns null for non-interviews, bad JSON and provider errors', async () => {
    await expect(extractInterviewEvent(calEvent, ROLES, fakeLlm('{"is_activity":false}'))).resolves.toBeNull()
    await expect(extractInterviewEvent(calEvent, ROLES, fakeLlm('{oops'))).resolves.toBeNull()
    await expect(extractInterviewEvent(calEvent, ROLES, fakeLlm(new Error('HTTP 500')))).resolves.toBeNull()
  })
})

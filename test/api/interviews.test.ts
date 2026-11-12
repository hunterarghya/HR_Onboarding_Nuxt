import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, expectError } from './helpers/http'
import { itRequiresLogin, userToken } from './helpers/auth'
import { assignCandidate, db, insertCandidate, insertEvent, insertJob, resetDb } from './helpers/db'
import { runTask, startTask, waitForTask } from './helpers/tasks'

const assignedIds = async (eventId: number) => {
  const { rows } = await db().query('SELECT candidate_id FROM interview_candidates WHERE event_id = $1 ORDER BY candidate_id', [eventId])
  return rows.map(r => r.candidate_id)
}

describe('POST /api/interviews/sync-calendar', () => {
  beforeAll(resetDb)
  itRequiresLogin('POST', '/api/interviews/sync-calendar')

  it('runs as a task; with no job roles it completes without importing', async () => {
    const taskId = await startTask('POST', '/api/interviews/sync-calendar')
    expect(taskId).toBe('calendar.sync')
    const outcome = await waitForTask(taskId)
    expect(outcome).toMatchObject({ state: 'completed', result: { message: 'No active job roles found', imported: 0 } })
  })

  it('fails the task with the reason when Google is unreachable', async () => {
    await insertJob()
    const outcome = await runTask('POST', '/api/interviews/sync-calendar')
    expect(outcome.state).toBe('failed')
    expect(outcome.error).toMatch(/^Calendar sync failed: /)
  })
})

describe('GET /api/interviews/events', () => {
  beforeAll(resetDb)

  it('lists events by date then start time', async () => {
    await insertEvent({ event_date: '2030-02-01', start_time: '09:00' })
    await insertEvent({ event_date: '2030-01-01', start_time: '15:00' })
    await insertEvent({ event_date: '2030-01-01', start_time: '10:00' })
    const res = await api('GET', '/api/interviews/events')
    expect(res.status).toBe(200)
    expect(res.body.map((e: any) => e.start_time)).toEqual(['10:00:00', '15:00:00', '09:00:00'])
    expect(res.body[0]).toMatchObject({ id: expect.any(Number), role: 'Backend Developer', event_date: expect.any(String), google_event_id: null })
  })
})

describe('POST /api/interviews/events', () => {
  itRequiresLogin('POST', '/api/interviews/events', {})

  beforeAll(async () => {
    await resetDb()
    await insertJob({ role: 'Backend Developer' })
  })

  const slot = { role: 'Backend Developer', event_date: '2030-05-01', start_time: '10:00', end_time: '12:00', sync_calendar: false }

  it.each([
    ['only a role', { role: 'Backend Developer' }],
    ['a malformed date', { ...slot, event_date: '01/05/2030' }],
    ['a malformed time', { ...slot, start_time: '10am' }],
    ['an end before the start', { ...slot, start_time: '12:00', end_time: '10:00' }],
    ['an end equal to the start', { ...slot, end_time: '10:00' }],
    ['zero candidates', { ...slot, num_candidates: 0 }],
    ['negative extras', { ...slot, extra_candidates: -1 }],
    ['text as a count', { ...slot, num_candidates: 'five' }],
    ['an unknown mode', { ...slot, interview_mode: 'hybrid' }],
    ['an online slot with a venue instead of a link', { ...slot, interview_mode: 'online', venue_or_link: 'Room 4' }],
    ['a non-boolean sync flag', { ...slot, sync_calendar: 'no' }],
    ['an unknown field', { ...slot, colour: 'blue' }]
  ])('rejects %s (400)', async (_label, body) => {
    expectError(await api('POST', '/api/interviews/events', { token: userToken(), body }), 400, 'Validation failed')
  })

  it('rejects a role that is not a current job (400)', async () => {
    const res = await api('POST', '/api/interviews/events', { token: userToken(), body: { ...slot, role: 'Astronaut' } })
    expectError(res, 400, 'Unknown job role')
  })

  it('accepts "Open Role" and empty counts', async () => {
    const res = await api('POST', '/api/interviews/events', { token: userToken(), body: { ...slot, role: 'Open Role', num_candidates: '', extra_candidates: null } })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ role: 'Open Role', num_candidates: 5, extra_candidates: 0, event_date: '2030-05-01' })
  })

  it('accepts an online slot with a meeting link', async () => {
    const res = await api('POST', '/api/interviews/events', { token: userToken(), body: { ...slot, interview_mode: 'online', venue_or_link: 'https://meet.example.com/abc' } })
    expect(res.status).toBe(201)
  })

  it('creates a local-only event with defaults', async () => {
    const res = await api('POST', '/api/interviews/events', {
      token: userToken(),
      body: { role: 'Backend Developer', event_date: '2030-05-01', start_time: '10:00', end_time: '12:00', sync_calendar: false }
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ role: 'Backend Developer', num_candidates: 5, extra_candidates: 0, interview_mode: 'offline', venue_or_link: null, google_event_id: null })
  })

  it('still saves locally when the calendar sync fails', async () => {
    const res = await api('POST', '/api/interviews/events', {
      token: userToken(),
      body: { role: 'Backend Developer', event_date: '2030-05-02', start_time: '10:00', end_time: '12:00', interview_mode: 'online' }
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ interview_mode: 'online', google_event_id: null })
  })
})

describe('DELETE /api/interviews/events/:id', () => {
  itRequiresLogin('DELETE', '/api/interviews/events/1')

  it('deletes the event and its assignments', async () => {
    const evt = await insertEvent()
    const c = await insertCandidate()
    await assignCandidate(evt.id, c.id)
    const res = await api('DELETE', `/api/interviews/events/${evt.id}`, { token: userToken() })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Event deleted successfully' })
    expect(await assignedIds(evt.id)).toEqual([])
  })

  it('returns 404 for an unknown id', async () => {
    expectError(await api('DELETE', '/api/interviews/events/999999', { token: userToken() }), 404, 'Event not found')
  })

  it('rejects a non-numeric id (400, was a 500 crash)', async () => {
    expectError(await api('DELETE', '/api/interviews/events/abc'), 400)
    expectError(await api('POST', '/api/interviews/events/abc/candidates/manual', { body: { candidate_ids: [] } }), 400)
  })
})

describe('event candidate assignment', () => {
  let a: any, b: any, c: any

  beforeEach(async () => {
    await resetDb()
    await insertJob({ role: 'Backend Developer' })
    a = await insertCandidate({ name: 'A', score: 90 })
    b = await insertCandidate({ name: 'B', score: 80 })
    c = await insertCandidate({ name: 'C', score: 70 })
    await insertCandidate({ name: 'Rejected', score: 99, status: 'rejected' })
  })

  describe('GET /api/interviews/events/:id/candidates', () => {
    it('lists assigned candidates by score with assignment columns', async () => {
      const evt = await insertEvent()
      await assignCandidate(evt.id, c.id)
      await assignCandidate(evt.id, a.id, true)
      const res = await api('GET', `/api/interviews/events/${evt.id}/candidates`)
      expect(res.status).toBe(200)
      expect(res.body.map((r: any) => [r.name, r.invite_sent])).toEqual([['A', true], ['C', false]])
      expect(res.body[0]).toHaveProperty('assigned_at')
    })
  })

  describe('POST /api/interviews/events/:id/candidates/manual', () => {
    it('replaces the assignment and resets invite flags (BUG-04)', async () => {
      const evt = await insertEvent()
      await assignCandidate(evt.id, a.id, true)
      const res = await api('POST', `/api/interviews/events/${evt.id}/candidates/manual`, { body: { candidate_ids: [a.id, b.id] } })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ message: 'Candidates assigned successfully', count: 2 })
      const { rows } = await db().query('SELECT invite_sent FROM interview_candidates WHERE event_id = $1 AND candidate_id = $2', [evt.id, a.id])
      expect(rows[0].invite_sent).toBe(false)
    })

    it('requires a candidate_ids array (400)', async () => {
      const evt = await insertEvent()
      expectError(await api('POST', `/api/interviews/events/${evt.id}/candidates/manual`, { body: {} }), 400, 'Validation failed')
    })

    it.each([
      ['text ids', ['1']],
      ['duplicate ids', 'dup'],
      ['negative ids', [-1]]
    ])('rejects %s (400)', async (_label, ids) => {
      const evt = await insertEvent()
      const candidate_ids = ids === 'dup' ? [a.id, a.id] : ids
      expectError(await api('POST', `/api/interviews/events/${evt.id}/candidates/manual`, { body: { candidate_ids } }), 400, 'Validation failed')
    })

    it('rejects unknown candidates and keeps the old list (400)', async () => {
      const evt = await insertEvent()
      await assignCandidate(evt.id, a.id)
      const res = await api('POST', `/api/interviews/events/${evt.id}/candidates/manual`, { body: { candidate_ids: [b.id, 999999] } })
      expectError(res, 400, 'Unknown candidates')
      expect(await assignedIds(evt.id)).toEqual([a.id])
    })

    it('returns 404 for an unknown event (it used to report success)', async () => {
      expectError(await api('POST', '/api/interviews/events/999999/candidates/manual', { body: { candidate_ids: [] } }), 404, 'Event not found')
    })
  })

  describe('PATCH /api/interviews/events/:id/candidates/manual', () => {
    it('replaces the assignment', async () => {
      const evt = await insertEvent()
      await assignCandidate(evt.id, a.id)
      const res = await api('PATCH', `/api/interviews/events/${evt.id}/candidates/manual`, { body: { candidate_ids: [c.id] } })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ message: 'Candidates updated successfully', count: 1 })
      expect(await assignedIds(evt.id)).toEqual([c.id])
    })

    it('requires a candidate_ids array (400)', async () => {
      const evt = await insertEvent()
      expectError(await api('PATCH', `/api/interviews/events/${evt.id}/candidates/manual`, { body: { candidate_ids: 'x' } }), 400)
    })
  })

  describe('POST /api/interviews/events/:id/candidates/auto', () => {
    it('fills the slots with the top eligible candidates', async () => {
      const evt = await insertEvent({ num_candidates: 1, extra_candidates: 1 })
      const res = await api('POST', `/api/interviews/events/${evt.id}/candidates/auto`)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ message: 'Candidates auto-assigned successfully', count: 2 })
      expect(await assignedIds(evt.id)).toEqual([a.id, b.id])
    })

    it('skips candidates already assigned to another event for the same role', async () => {
      const first = await insertEvent()
      await assignCandidate(first.id, a.id)
      const evt = await insertEvent({ num_candidates: 5 })
      await api('POST', `/api/interviews/events/${evt.id}/candidates/auto`)
      expect(await assignedIds(evt.id)).toEqual([b.id, c.id])
    })

    it('reports when nobody is eligible', async () => {
      const evt = await insertEvent({ role: 'Nobody Applied' })
      const res = await api('POST', `/api/interviews/events/${evt.id}/candidates/auto`)
      expect(res.body).toEqual({ message: 'No eligible candidates found', count: 0 })
    })

    it('returns 404 for an unknown event', async () => {
      expectError(await api('POST', '/api/interviews/events/999999/candidates/auto'), 404, 'Event not found')
    })

    it('fills an "Open Role" event from the Open pool, even with no jobs at all (was a 500: BUG-05)', async () => {
      await db().query('DELETE FROM job_roles') // the candidates' job links become NULL: the Open pool
      const evt = await insertEvent({ role: 'Open Role' })
      const res = await api('POST', `/api/interviews/events/${evt.id}/candidates/auto`)
      expect(res.body).toEqual({ message: 'Candidates auto-assigned successfully', count: 2 })
    })
  })

  describe('POST /api/interviews/events/auto-assign-all', () => {
    it('distributes candidates across the role\'s events in date order', async () => {
      const later = await insertEvent({ event_date: '2030-01-20', num_candidates: 2 })
      const earlier = await insertEvent({ event_date: '2030-01-10', num_candidates: 1 })
      const res = await api('POST', '/api/interviews/events/auto-assign-all', { body: { role: 'Backend Developer' } })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ message: 'Auto-assigned 3 candidates across 2 events' })
      expect(await assignedIds(earlier.id)).toEqual([a.id])
      expect(await assignedIds(later.id)).toEqual([b.id, c.id])
    })

    it('reports when the role has no events', async () => {
      const res = await api('POST', '/api/interviews/events/auto-assign-all', { body: { role: 'Nobody' } })
      expect(res.body).toEqual({ message: 'No events found for this role', count: 0 })
    })

    it('requires role (400)', async () => {
      expectError(await api('POST', '/api/interviews/events/auto-assign-all', { body: {} }), 400, 'Validation failed')
    })
  })

  describe('GET /api/interviews/eligible-candidates/:eventId', () => {
    it('lists eligible candidates for the event role by score', async () => {
      const evt = await insertEvent()
      const res = await api('GET', `/api/interviews/eligible-candidates/${evt.id}`)
      expect(res.status).toBe(200)
      expect(res.body.map((r: any) => r.name)).toEqual(['A', 'B', 'C'])
    })

    it('for "Open Role", lists candidates whose role is not an active job', async () => {
      await insertCandidate({ name: 'Unmatched', role_applied: 'Open', score: 50 })
      const evt = await insertEvent({ role: 'Open Role' })
      const res = await api('GET', `/api/interviews/eligible-candidates/${evt.id}`)
      expect(res.body.map((r: any) => r.name)).toEqual(['Unmatched'])
    })

    it('returns 404 for an unknown event', async () => {
      expectError(await api('GET', '/api/interviews/eligible-candidates/999999'), 404, 'Event not found')
    })
  })
})

describe('POST /api/interviews/register-webhook', () => {
  itRequiresLogin('POST', '/api/interviews/register-webhook', {})

  it('requires webhook_url (400)', async () => {
    expectError(await api('POST', '/api/interviews/register-webhook', { token: userToken(), body: {} }), 400, 'Validation failed')
  })

  it.each(['not a url', 'http://example.com/hook', 'javascript:alert(1)'])('rejects %s (400: Google only calls https)', async (webhook_url) => {
    expectError(await api('POST', '/api/interviews/register-webhook', { token: userToken(), body: { webhook_url } }), 400, 'Validation failed')
  })

  it('returns 500 when Google is unreachable', async () => {
    const res = await api('POST', '/api/interviews/register-webhook', { token: userToken(), body: { webhook_url: 'https://example.com/hook' } })
    expectError(res, 500, 'Failed to register webhook')
  })
})

describe('POST /api/interviews/webhook', () => {
  it('acknowledges any push notification without a session', async () => {
    const res = await api('POST', '/api/interviews/webhook', { body: {}, token: null })
    expect(res.status).toBe(200)
    expect(res.body).toBe('OK')
  })
})

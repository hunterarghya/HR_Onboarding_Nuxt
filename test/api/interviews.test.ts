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

  it('requires role, date and times (400)', async () => {
    const res = await api('POST', '/api/interviews/events', { token: userToken(), body: { role: 'x' } })
    expectError(res, 400, 'role, event_date, start_time, end_time are required')
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
      expectError(await api('POST', `/api/interviews/events/${evt.id}/candidates/manual`, { body: {} }), 400, 'candidate_ids array is required')
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

    it('crashes with 500 for an "Open Role" event when no job roles exist (BUG-05)', async () => {
      await db().query('DELETE FROM job_roles')
      const evt = await insertEvent({ role: 'Open Role' })
      expectError(await api('POST', `/api/interviews/events/${evt.id}/candidates/auto`), 500)
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
      expectError(await api('POST', '/api/interviews/events/auto-assign-all', { body: {} }), 400, 'role is required')
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
    expectError(await api('POST', '/api/interviews/register-webhook', { token: userToken(), body: {} }), 400, 'webhook_url is required')
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

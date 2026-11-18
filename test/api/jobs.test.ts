import { beforeAll, describe, expect, it } from 'vitest'
import { api, expectError } from './helpers/http'
import { assignCandidate, db, insertCandidate, insertEvent, insertForm, insertJob, resetDb } from './helpers/db'
import { waitForTask } from './helpers/tasks'

beforeAll(resetDb)

describe('POST /api/jobs', () => {
  it('creates a job with numeric salary and experience, and defaults', async () => {
    const res = await api('POST', '/api/jobs', {
      body: { role: '  Data Engineer ', salary_min: 1200000, salary_max: 1500000, skills: 'python, spark', experience_min_years: 3, location: 'Pune' }
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      role: 'Data Engineer',
      salary_min: 1200000, // numbers, not strings
      salary_max: 1500000,
      experience_min_years: 3,
      shortlist_mode: 'manual',
      min_score: 60,
      criteria_weights: {},
      deadline: null
    })
  })

  it('treats empty number inputs and an empty deadline as "not set" (was a 500: VAL-01)', async () => {
    const res = await api('POST', '/api/jobs', { body: { role: 'Ops', salary_min: '', experience_min_years: '', deadline: '' } })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ salary_min: null, experience_min_years: null, deadline: null })
  })

  it('keeps a min_score of 0 (it used to become 60: BUG-03)', async () => {
    const res = await api('POST', '/api/jobs', { body: { role: 'Intern', min_score: 0, shortlist_mode: 'auto' } })
    expect(res.body).toMatchObject({ min_score: 0, shortlist_mode: 'auto' })
  })

  it.each([
    ['no role', { salary_min: 100 }],
    ['a blank role', { role: '   ' }],
    ['text as salary', { role: 'X', salary_min: 'lots of money' }],
    ['a negative salary', { role: 'X', salary_min: -1 }],
    ['salary_min above salary_max', { role: 'X', salary_min: 20, salary_max: 10 }],
    ['experience out of range', { role: 'X', experience_min_years: 99 }],
    ['an unknown shortlist mode', { role: 'X', shortlist_mode: 'sometimes' }],
    ['min_score above 100', { role: 'X', min_score: 101 }],
    ['a fractional min_score', { role: 'X', min_score: 60.5 }],
    ['a malformed deadline', { role: 'X', deadline: 'next friday' }],
    ['an unknown criteria weight', { role: 'X', criteria_weights: { charisma: 10 } }],
    ['an unknown field', { role: 'X', salary: '12 LPA' }]
  ])('rejects %s (400)', async (_label, body) => {
    expectError(await api('POST', '/api/jobs', { body }), 400, 'Validation failed')
  })

  it('the database refuses bad values written around the API too', async () => {
    await expect(db().query('INSERT INTO job_roles (role, shortlist_mode) VALUES (\'X\', \'sometimes\')')).rejects.toThrow(/job_roles_shortlist_mode_check/)
    await expect(db().query('INSERT INTO job_roles (role, min_score) VALUES (\'X\', 150)')).rejects.toThrow(/job_roles_min_score_check/)
  })
})

describe('job description indexing when Qdrant is down (BUG-11)', () => {
  // The smoke environment has no Qdrant, so every index attempt fails
  it('still creates the job and indexes it as a background task, which retries', async () => {
    const res = await api('POST', '/api/jobs', { body: { role: 'Indexing Probe' } })
    expect(res.status).toBe(201)
    const outcome = await waitForTask(`vectors.job.${res.body.id}`)
    expect(outcome).toMatchObject({ state: 'failed', attempts: 3, title: 'Prepare “Indexing Probe” for resume matching' })
  })

  it('re-indexes an edited job in the background too', async () => {
    const job = await insertJob({ role: 'Edit Probe' })
    expect((await api('PATCH', `/api/jobs/${job.id}`, { body: { skills: 'Go' } })).status).toBe(200)
    expect((await waitForTask(`vectors.job.${job.id}`)).state).toBe('failed')
  })

  it('retries removing a deleted job from the index', async () => {
    const job = await insertJob()
    expect((await api('DELETE', `/api/jobs/${job.id}`)).status).toBe(200)
    const outcome = await waitForTask(`vectors.remove.${job.id}`)
    expect(outcome.state).toBe('failed')
  })

  it('re-indexes all jobs in the background at boot instead of before serving', async () => {
    const outcome = await waitForTask('vectors.resyncAll')
    expect(outcome.state).toBe('failed') // no Qdrant here; with Qdrant it completes with { indexed }
  })
})

describe('GET /api/jobs', () => {
  it('lists jobs newest first, joined with their google form', async () => {
    const job = await insertJob({ role: 'QA Engineer' })
    const form = await insertForm({ job_role_id: job.id })

    const res = await api('GET', '/api/jobs')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toMatchObject({
      id: job.id,
      role: 'QA Engineer',
      form_url: form.form_url,
      google_form_id: form.form_id,
      google_form_db_id: form.id
    })
  })
})

describe('PATCH /api/jobs/:id', () => {
  it('updates allowed fields and returns the job with its form columns', async () => {
    const job = await insertJob()
    const res = await api('PATCH', `/api/jobs/${job.id}`, {
      body: { location: 'Hyderabad', criteria_weights: { skills: 2 }, salary_max: 2000000 }
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: job.id, location: 'Hyderabad', criteria_weights: { skills: 2 }, salary_max: 2000000, form_url: null })
  })

  it('rejects unknown fields, an empty update and bad values (400)', async () => {
    const job = await insertJob()
    expectError(await api('PATCH', `/api/jobs/${job.id}`, { body: { nope: 1 } }), 400, 'Validation failed')
    expectError(await api('PATCH', `/api/jobs/${job.id}`, { body: {} }), 400, 'Validation failed')
    expectError(await api('PATCH', `/api/jobs/${job.id}`, { body: { min_score: -5 } }), 400, 'Validation failed')
  })

  it('returns 404 for an unknown id', async () => {
    expectError(await api('PATCH', '/api/jobs/999999', { body: { location: 'X' } }), 404, 'Job role not found')
  })

  it('rejects a non-numeric id (400, was a 500 crash)', async () => {
    expectError(await api('PATCH', '/api/jobs/abc', { body: { location: 'X' } }), 400)
  })
})

describe('DELETE /api/jobs/:id', () => {
  it('deletes the job', async () => {
    const job = await insertJob()
    const res = await api('DELETE', `/api/jobs/${job.id}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Job role deleted successfully' })
    const { rowCount } = await db().query('SELECT 1 FROM job_roles WHERE id = $1', [job.id])
    expect(rowCount).toBe(0)
  })

  it('returns 404 for an unknown id (BUG-12: it said "deleted")', async () => {
    expectError(await api('DELETE', '/api/jobs/999999'), 404, 'Job role not found')
  })

  it('keeps the job\'s candidates and events, moved to Open', async () => {
    const job = await insertJob({ role: 'Short Lived' })
    const c = await insertCandidate({ role_applied: 'Short Lived' })
    const e = await insertEvent({ role: 'Short Lived' })
    await api('DELETE', `/api/jobs/${job.id}`)
    const { rows: [cand] } = await db().query('SELECT job_role_id, role_applied FROM candidates WHERE id = $1', [c.id])
    const { rows: [evt] } = await db().query('SELECT job_role_id, role FROM interview_events WHERE id = $1', [e.id])
    expect(cand).toEqual({ job_role_id: null, role_applied: 'Open' })
    expect(evt).toEqual({ job_role_id: null, role: 'Open Role' })
  })
})

describe('job names', () => {
  it('renaming a job keeps its candidates and events with it (BUG-10)', async () => {
    const job = await insertJob({ role: 'Old Name' })
    const c = await insertCandidate({ name: 'Linked', role_applied: 'Old Name', score: 77 })
    const e = await insertEvent({ role: 'Old Name' })
    await assignCandidate(e.id, c.id)

    expect((await api('PATCH', `/api/jobs/${job.id}`, { body: { role: 'New Name' } })).status).toBe(200)

    const { rows: [cand] } = await db().query('SELECT job_role_id, role_applied FROM candidates WHERE id = $1', [c.id])
    expect(cand).toEqual({ job_role_id: job.id, role_applied: 'New Name' })
    const events = await api('GET', '/api/interviews/events')
    expect(events.body.find((x: { id: number }) => x.id === e.id)).toMatchObject({ role: 'New Name', job_role_id: job.id })
    // still eligible for the job's events, and still filtered under the job's (new) name
    const eligible = await api('GET', `/api/interviews/eligible-candidates/${e.id}`)
    expect(eligible.body.map((x: { name: string }) => x.name)).toContain('Linked')
    const listed = await api('GET', '/api/candidates', { query: { role: 'New Name' } })
    expect(listed.body.data.map((x: { name: string }) => x.name)).toContain('Linked')
  })

  it('refuses a second job with the same name, ignoring case and spaces (409)', async () => {
    await insertJob({ role: 'Unique Role' })
    expectError(await api('POST', '/api/jobs', { body: { role: '  unique role ' } }), 409, 'A job named "Unique Role" already exists')
    const other = await insertJob({ role: 'Another Role' })
    expectError(await api('PATCH', `/api/jobs/${other.id}`, { body: { role: 'UNIQUE ROLE' } }), 409)
  })

  it('lets a job keep its own name on update', async () => {
    const job = await insertJob({ role: 'Steady Role' })
    expect((await api('PATCH', `/api/jobs/${job.id}`, { body: { role: 'steady role' } })).status).toBe(200)
  })

  it.each(['Open', 'open role'])('reserves "%s" for candidates and events without a job (400)', async (role) => {
    expectError(await api('POST', '/api/jobs', { body: { role } }), 400, 'Validation failed')
  })
})

import { beforeAll, describe, expect, it } from 'vitest'
import { api, expectError } from './helpers/http'
import { db, insertForm, insertJob, resetDb } from './helpers/db'

beforeAll(resetDb)

describe('POST /api/jobs', () => {
  it('creates a job with defaults', async () => {
    const res = await api('POST', '/api/jobs', {
      body: { role: 'Data Engineer', salary: '1500000', skills: 'python, spark', experience: '3 years', location: 'Pune' }
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      role: 'Data Engineer',
      salary: '1500000',
      shortlist_mode: 'manual',
      min_score: 60,
      criteria_weights: {}
    })
  })

  it('accepts a non-numeric salary (VAL: no validation yet)', async () => {
    const res = await api('POST', '/api/jobs', { body: { role: 'Designer', salary: 'lots of money' } })
    expect(res.status).toBe(201)
    expect(res.body.salary).toBe('lots of money')
  })

  it('rejects an empty deadline (400, was a 500 crash: VAL-01)', async () => {
    expectError(await api('POST', '/api/jobs', { body: { role: 'Ops', deadline: '' } }), 400, 'Invalid date/time value')
  })

  it('rejects a job without a role (400, was a 500 crash)', async () => {
    expectError(await api('POST', '/api/jobs', { body: { salary: '100' } }), 400, 'Validation failed')
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
      body: { location: 'Hyderabad', criteria_weights: { skills: 2 }, id: 999, not_a_column: 'x' }
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: job.id, location: 'Hyderabad', criteria_weights: { skills: 2 }, form_url: null })
  })

  it('rejects a body with no allowed fields (400)', async () => {
    const job = await insertJob()
    expectError(await api('PATCH', `/api/jobs/${job.id}`, { body: { nope: 1 } }), 400, 'No valid fields provided for update')
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

  it('also returns 200 for an unknown id (no existence check today)', async () => {
    const res = await api('DELETE', '/api/jobs/999999')
    expect(res.status).toBe(200)
  })
})

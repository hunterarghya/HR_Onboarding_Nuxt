import { beforeAll, describe, expect, it } from 'vitest'
import { api, expectError } from './helpers/http'
import { itRequiresLogin, userToken } from './helpers/auth'
import { db, insertForm, insertJob, resetDb } from './helpers/db'

beforeAll(resetDb)

describe('GET /api/google-forms', () => {
  itRequiresLogin('GET', '/api/google-forms')

  it('lists forms with their job role name', async () => {
    const job = await insertJob({ role: 'SRE' })
    const form = await insertForm({ job_role_id: job.id })
    const res = await api('GET', '/api/google-forms', { token: userToken() })
    expect(res.status).toBe(200)
    expect(res.body).toEqual([expect.objectContaining({
      id: form.id,
      form_id: form.form_id,
      job_role_id: job.id,
      job_role_name: 'SRE',
      question_map: { resume: 'q1', email: 'q2' }
    })])
  })
})

describe('POST /api/google-forms/create', () => {
  itRequiresLogin('POST', '/api/google-forms/create', { jobRoleId: 1 })

  it('requires jobRoleId (400)', async () => {
    expectError(await api('POST', '/api/google-forms/create', { token: userToken(), body: {} }), 400, 'Validation failed')
  })

  it('returns 404 for an unknown job role', async () => {
    expectError(await api('POST', '/api/google-forms/create', { token: userToken(), body: { jobRoleId: 999999 } }), 404, 'Job role not found')
  })

  it('returns 409 when the job already has a form', async () => {
    const job = await insertJob()
    await insertForm({ job_role_id: job.id })
    expectError(await api('POST', '/api/google-forms/create', { token: userToken(), body: { jobRoleId: job.id } }), 409)
  })

  it('returns 500 when Google rejects the call, without Google\'s own error text (SEC-09)', async () => {
    const job = await insertJob()
    const res = await api('POST', '/api/google-forms/create', { token: userToken(), body: { jobRoleId: job.id } })
    expectError(res, 500, 'Failed to create Google Form')
    expect(res.body.data).toMatchObject({ code: 'GOOGLE_FORM_FAILED', details: null, requestId: expect.any(String) })
  })
})

describe('DELETE /api/google-forms/:id', () => {
  itRequiresLogin('DELETE', '/api/google-forms/1')

  it('deletes by database id', async () => {
    const form = await insertForm()
    const res = await api('DELETE', `/api/google-forms/${form.id}`, { token: userToken() })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Form removed', formId: form.form_id })
  })

  it('takes only the database id (400 for a Google form id)', async () => {
    const form = await insertForm()
    expectError(await api('DELETE', `/api/google-forms/${form.form_id}`, { token: userToken() }), 400)
  })

  it('returns 404 when nothing matches', async () => {
    expectError(await api('DELETE', '/api/google-forms/999999', { token: userToken() }), 404, 'Form not found')
  })
})

describe('removing a form', () => {
  it('also removes its scan record (BUG-12: it was left behind)', async () => {
    const form = await insertForm()
    await db().query(`INSERT INTO scan_timestamps (source_type, source_id, last_scanned_at) VALUES ('google_forms', $1, now())`, [form.form_id])
    await api('DELETE', `/api/google-forms/${form.id}`, { token: userToken() })
    const { rowCount } = await db().query('SELECT 1 FROM scan_timestamps WHERE source_id = $1', [form.form_id])
    expect(rowCount).toBe(0)
  })
})

describe('DELETE /api/jobs/:id/form', () => {
  itRequiresLogin('DELETE', '/api/jobs/1/form')

  it('forgets the form of a job (this replaces ?type=job)', async () => {
    const job = await insertJob()
    const form = await insertForm({ job_role_id: job.id })
    const res = await api('DELETE', `/api/jobs/${job.id}/form`, { token: userToken() })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Form removed', formId: form.form_id })
  })

  it('rejects a non-numeric job id (400)', async () => {
    expectError(await api('DELETE', '/api/jobs/abc/form', { token: userToken() }), 400)
  })

  it('returns 404 when the job has no form', async () => {
    const job = await insertJob()
    expectError(await api('DELETE', `/api/jobs/${job.id}/form`, { token: userToken() }), 404, 'Form not found')
  })
})

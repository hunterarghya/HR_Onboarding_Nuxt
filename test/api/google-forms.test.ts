import { beforeAll, describe, expect, it } from 'vitest'
import { api, expectError } from './helpers/http'
import { itRequiresLogin, userToken } from './helpers/auth'
import { insertForm, insertJob, resetDb } from './helpers/db'

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
    expectError(await api('POST', '/api/google-forms/create', { token: userToken(), body: {} }), 400, 'jobRoleId is required')
  })

  it('returns 404 for an unknown job role', async () => {
    expectError(await api('POST', '/api/google-forms/create', { token: userToken(), body: { jobRoleId: 999999 } }), 404, 'Job role not found')
  })

  it('returns 409 when the job already has a form', async () => {
    const job = await insertJob()
    await insertForm({ job_role_id: job.id })
    expectError(await api('POST', '/api/google-forms/create', { token: userToken(), body: { jobRoleId: job.id } }), 409)
  })

  it('returns 500 with details when Google rejects the call', async () => {
    const job = await insertJob()
    const res = await api('POST', '/api/google-forms/create', { token: userToken(), body: { jobRoleId: job.id } })
    expectError(res, 500, 'Failed to create Google Form')
    expect(res.body.data.details).toEqual(expect.any(String))
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

  it('deletes by google form id', async () => {
    const form = await insertForm()
    const res = await api('DELETE', `/api/google-forms/${form.form_id}`, { token: userToken() })
    expect(res.body).toEqual({ message: 'Form removed', formId: form.form_id })
  })

  it('deletes by job id with ?type=job', async () => {
    const job = await insertJob()
    const form = await insertForm({ job_role_id: job.id })
    const res = await api('DELETE', `/api/google-forms/${job.id}`, { token: userToken(), query: { type: 'job' } })
    expect(res.body).toEqual({ message: 'Form removed', formId: form.form_id })
  })

  it('rejects a non-numeric job id with ?type=job (400, was a 500 crash)', async () => {
    expectError(await api('DELETE', '/api/google-forms/abc', { query: { type: 'job' } }), 400)
  })

  it('returns 404 when nothing matches', async () => {
    expectError(await api('DELETE', '/api/google-forms/nope', { token: userToken() }), 404, 'Form not found')
  })
})

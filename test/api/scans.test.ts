import { beforeAll, describe, expect, it } from 'vitest'
import { api, expectError } from './helpers/http'
import { itChecksToken, userToken } from './helpers/auth'
import { insertForm, resetDb } from './helpers/db'

beforeAll(resetDb)

describe('POST /api/candidates/scan', () => {
  itChecksToken('POST', '/api/candidates/scan', {})

  it('completes with 0 candidates when no groups are given', async () => {
    const res = await api('POST', '/api/candidates/scan', { token: userToken(), body: {} })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'WhatsApp scan complete', count: 0 })
  })

  it('skips groups while WhatsApp is not ready', async () => {
    const res = await api('POST', '/api/candidates/scan', { token: userToken(), body: { whatsappGroupIds: ['123@g.us'] } })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'WhatsApp scan complete', count: 0 })
  })

  it('crashes with 500 when there is no body (VAL)', async () => {
    expectError(await api('POST', '/api/candidates/scan', { token: userToken() }), 500)
  })
})

describe('POST /api/candidates/scan-mail', () => {
  // A valid token goes straight to Gmail; that path is covered by the manual checklist.
  itChecksToken('POST', '/api/candidates/scan-mail', {})
})

describe('POST /api/candidates/scan-forms', () => {
  itChecksToken('POST', '/api/candidates/scan-forms', {})

  it('reports when no forms are configured', async () => {
    const res = await api('POST', '/api/candidates/scan-forms', { token: userToken(), body: {} })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'No Google Forms configured', count: 0 })
  })

  it('reports when the selected forms do not exist', async () => {
    await insertForm()
    const res = await api('POST', '/api/candidates/scan-forms', { token: userToken(), body: { formIds: ['nope'] } })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'No matching Google Forms found to scan', count: 0 })
  })

  it('completes with 0 candidates when Google is unreachable (per-form errors are swallowed)', async () => {
    const form = await insertForm()
    const res = await api('POST', '/api/candidates/scan-forms', { token: userToken(), body: { formIds: [form.form_id] } })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Google Forms scan complete', count: 0 })
  })
})

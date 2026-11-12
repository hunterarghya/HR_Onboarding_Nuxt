import { beforeEach, describe, expect, it } from 'vitest'
import { api, expectError } from './helpers/http'
import { itRequiresLogin, userToken } from './helpers/auth'
import { assignCandidate, db, insertCandidate, insertEvent, resetDb } from './helpers/db'
import { runTask, startTask, waitForTask } from './helpers/tasks'

beforeEach(resetDb)

const templateId = async (type: string): Promise<number> => {
  const { rows } = await db().query('SELECT id FROM email_templates WHERE is_default = true AND type = $1', [type])
  return rows[0].id
}

// Bulk mail is a background task: 202 { taskId }, then the counts come from GET /api/tasks/:id.
// Sending real mail needs Gmail; these cover every path that stops before (or survives) the Gmail call.

describe('POST /api/mail/interview-invites/:eventId', () => {
  itRequiresLogin('POST', '/api/mail/interview-invites/1', { templateId: 1 })

  it('requires templateId (400)', async () => {
    expectError(await api('POST', '/api/mail/interview-invites/1', { token: userToken(), body: {} }), 400, 'Validation failed')
  })

  it('rejects non-numeric ids (400, were 500s)', async () => {
    expectError(await api('POST', '/api/mail/interview-invites/1', { body: { templateId: 'abc' } }), 400)
    expectError(await api('POST', '/api/mail/interview-invites/abc', { body: { templateId: 1 } }), 400)
  })

  it('rejects an unknown template or event before queueing anything (404)', async () => {
    const evt = await insertEvent()
    expectError(await api('POST', `/api/mail/interview-invites/${evt.id}`, { body: { templateId: 999999 } }), 404, 'Template not found')
    expectError(await api('POST', '/api/mail/interview-invites/999999', { body: { templateId: await templateId('invite') } }), 404, 'Event not found')
  })

  it('skips candidates without email and counts Gmail failures', async () => {
    const evt = await insertEvent()
    await assignCandidate(evt.id, (await insertCandidate({ email: null })).id)
    await assignCandidate(evt.id, (await insertCandidate()).id)
    await assignCandidate(evt.id, (await insertCandidate()).id, true)
    const taskId = await startTask('POST', `/api/mail/interview-invites/${evt.id}`, { templateId: await templateId('invite') })
    expect(taskId).toBe(`mail.invites.event.${evt.id}`)
    const outcome = await waitForTask(taskId)
    expect(outcome).toMatchObject({ state: 'completed', result: { message: 'Invites processed', sent: 0, failed: 1, skipped: 1, total: 2 } })
    expect(outcome.progress).toMatchObject({ done: 2, total: 2 })
  })
})

describe('POST /api/mail/interview-invites-all', () => {
  itRequiresLogin('POST', '/api/mail/interview-invites-all', { templateId: 1 })

  it('requires templateId (400)', async () => {
    expectError(await api('POST', '/api/mail/interview-invites-all', { token: userToken(), body: {} }), 400, 'Validation failed')
  })

  it('processes every event with unsent invites', async () => {
    const e1 = await insertEvent()
    const e2 = await insertEvent()
    await assignCandidate(e1.id, (await insertCandidate({ email: null })).id)
    await assignCandidate(e2.id, (await insertCandidate({ email: null })).id)
    await assignCandidate(e2.id, (await insertCandidate()).id, true)
    const outcome = await runTask('POST', '/api/mail/interview-invites-all', { templateId: await templateId('invite') })
    expect(outcome.result).toEqual({ message: 'Bulk invites processed', sent: 0, failed: 0, skipped: 2, eventsProcessed: 2 })
  })
})

describe('sending mail before setting a company name', () => {
  it('is refused with a clear message (emails say "at {{company_name}}")', async () => {
    const { rows } = await db().query('INSERT INTO users (email) VALUES (\'no-company@example.com\') ON CONFLICT (email) DO UPDATE SET company_name = NULL RETURNING id')
    const token = userToken({ email: 'no-company@example.com' }, rows[0].id)
    const res = await api('POST', '/api/mail/interview-invites-all', { token, body: { templateId: await templateId('invite') } })
    expectError(res, 400, 'Set your company name (user menu) before sending emails')
  })
})

describe('POST /api/mail/offer-letters', () => {
  itRequiresLogin('POST', '/api/mail/offer-letters', { templateId: 1, candidateIds: [1] })

  it('requires templateId and candidateIds (400)', async () => {
    const res = await api('POST', '/api/mail/offer-letters', { token: userToken(), body: { templateId: 1, candidateIds: [] } })
    expectError(res, 400, 'Validation failed')
  })

  it.each([
    ['duplicate ids', [1, 1]],
    ['text ids', ['1']],
    ['more than 500 ids', Array.from({ length: 501 }, (_, i) => i + 1)]
  ])('rejects %s (400)', async (_label, candidateIds) => {
    expectError(await api('POST', '/api/mail/offer-letters', { token: userToken(), body: { templateId: 1, candidateIds } }), 400, 'Validation failed')
  })

  it('refuses a template that is not for offers (400)', async () => {
    const c = await insertCandidate({ status: 'selected' })
    const res = await api('POST', '/api/mail/offer-letters', { token: userToken(), body: { templateId: await templateId('invite'), candidateIds: [c.id] } })
    expectError(res, 400, 'Wrong template type')
  })

  it('only mails selected candidates whose offer is unsent', async () => {
    const noEmail = await insertCandidate({ email: null, status: 'selected' })
    const withEmail = await insertCandidate({ status: 'selected' })
    const alreadySent = await insertCandidate({ status: 'selected', offer_sent: true })
    const notSelected = await insertCandidate()
    const outcome = await runTask('POST', '/api/mail/offer-letters', {
      templateId: await templateId('offer'), candidateIds: [noEmail.id, withEmail.id, alreadySent.id, notSelected.id]
    })
    expect(outcome.result).toEqual({ message: 'Offer letters processed', sent: 0, failed: 1, skipped: 1, total: 2 })
  })
})

describe('GET /api/mail/unsent-invites-count', () => {
  it('counts unsent invites per event (counts are strings: pg bigint)', async () => {
    const evt = await insertEvent()
    const done = await insertEvent()
    await assignCandidate(evt.id, (await insertCandidate()).id)
    await assignCandidate(evt.id, (await insertCandidate()).id, true)
    await assignCandidate(done.id, (await insertCandidate()).id, true)
    const res = await api('GET', '/api/mail/unsent-invites-count')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ event_id: evt.id, event_date: expect.any(String), unsent_count: '1', total_count: '2' }])
  })
})

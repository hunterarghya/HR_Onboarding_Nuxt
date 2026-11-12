import { beforeAll, describe, expect, it } from 'vitest'
import { api, expectError } from './helpers/http'
import { itRequiresLogin, userToken } from './helpers/auth'
import { insertForm, resetDb } from './helpers/db'
import { runTask, startTask, testQueue, waitForTask } from './helpers/tasks'

beforeAll(resetDb)

// Scans are background tasks: 202 { taskId }, then the result is read from GET /api/tasks/:id.

describe('POST /api/candidates/scan', () => {
  itRequiresLogin('POST', '/api/candidates/scan', {})

  it('runs as a task and completes with 0 candidates when no groups are given', async () => {
    const taskId = await startTask('POST', '/api/candidates/scan', {})
    expect(taskId).toBe('scan.whatsapp')
    const outcome = await waitForTask(taskId)
    expect(outcome).toMatchObject({ state: 'completed', result: { message: 'WhatsApp scan complete', count: 0 } })
    expect(outcome.progress).toEqual({ done: 0, total: 0, stage: 'processing resumes' })
  })

  it('skips groups while WhatsApp is not ready', async () => {
    const outcome = await runTask('POST', '/api/candidates/scan', { whatsappGroupIds: ['123@g.us'] })
    expect(outcome).toMatchObject({ state: 'completed', result: { message: 'WhatsApp scan complete', count: 0 } })
  })

  it('rejects a request with no body (400, before anything is queued)', async () => {
    expectError(await api('POST', '/api/candidates/scan', { token: userToken() }), 400)
  })

  it.each([
    ['a group id that is not a WhatsApp group', { whatsappGroupIds: ['hello'] }],
    ['the old single-group field', { whatsappGroupId: '123@g.us' }],
    ['a group list that is not a list', { whatsappGroupIds: '123@g.us' }]
  ])('rejects %s (400)', async (_label, body) => {
    expectError(await api('POST', '/api/candidates/scan', { token: userToken(), body }), 400, 'Validation failed')
  })
})

describe('POST /api/candidates/scan-mail', () => {
  itRequiresLogin('POST', '/api/candidates/scan-mail', {})

  it('fails the task after its retries when Gmail is unreachable, with the reason', async () => {
    const outcome = await runTask('POST', '/api/candidates/scan-mail')
    expect(outcome.state).toBe('failed')
    expect(outcome.attempts).toBe(3)
    expect(outcome.error).toMatch(/^Email scan failed: /)
  })

  it('refuses a second scan while one is queued or running (409)', async () => {
    const queue = testQueue('scans')
    await (await queue.getJob('scan.gmail'))?.remove() // the finished task from the test above
    // park a Gmail scan that won't start for a minute, as if one were already in progress
    await queue.add('scan.gmail', { userId: 0 }, { jobId: 'scan.gmail', delay: 60_000 })
    try {
      expectError(await api('POST', '/api/candidates/scan-mail'), 409, 'Email scan already in progress')
      const status = await api('GET', '/api/candidates/scan-status')
      expect(status.body.gmail.running).toBe(true)
    } finally {
      await (await queue.getJob('scan.gmail'))?.remove()
      await queue.close()
    }
  })
})

describe('POST /api/candidates/scan-forms', () => {
  itRequiresLogin('POST', '/api/candidates/scan-forms', {})

  it('reports when no forms are configured', async () => {
    const outcome = await runTask('POST', '/api/candidates/scan-forms', {})
    expect(outcome).toMatchObject({ state: 'completed', result: { message: 'No Google Forms configured', count: 0 } })
  })

  it('reports when the selected forms do not exist', async () => {
    await insertForm()
    const outcome = await runTask('POST', '/api/candidates/scan-forms', { formIds: ['nope'] })
    expect(outcome.result).toEqual({ message: 'No matching Google Forms found to scan', count: 0 })
  })

  it('completes with 0 candidates when Google is unreachable (per-form errors are swallowed)', async () => {
    const form = await insertForm()
    const outcome = await runTask('POST', '/api/candidates/scan-forms', { formIds: [form.form_id] })
    expect(outcome.result).toEqual({ message: 'Google Forms scan complete', count: 0 })
  })

  it('treats a request with no body as "every form"', async () => {
    expect(await startTask('POST', '/api/candidates/scan-forms')).toBe('scan.forms')
    await waitForTask('scan.forms')
  })

  it.each([
    ['form ids that are not a list (they used to be ignored)', { formIds: 'abc' }],
    ['a malformed form id', { formIds: ['../etc'] }]
  ])('rejects %s (400)', async (_label, body) => {
    expectError(await api('POST', '/api/candidates/scan-forms', { token: userToken(), body }), 400, 'Validation failed')
  })
})

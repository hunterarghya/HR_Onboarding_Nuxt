import { Queue } from 'bullmq'
import { expect } from 'vitest'
import { TEST_REDIS_URL } from '../setup/test-env'
import { api } from './http'

export interface TaskOutcome {
  state: 'completed' | 'failed'
  result: any
  error: string | null
  attempts: number
  progress: { done: number, total: number, stage?: string } | null
}

/**
 * The background-task contract: the endpoint answers 202 { taskId, status: 'queued' }, then
 * GET /api/tasks/:id is polled until the worker finishes.
 */
export const startTask = async (method: string, path: string, body?: unknown) => {
  const res = await api(method, path, { body })
  expect(res.status, JSON.stringify(res.body)).toBe(202)
  expect(res.body).toEqual({ taskId: expect.any(String), status: 'queued' })
  return res.body.taskId as string
}

export const waitForTask = async (taskId: string, timeoutMs = 20_000): Promise<TaskOutcome> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { body } = await api('GET', `/api/tasks/${encodeURIComponent(taskId)}`)
    if (body.state === 'completed' || body.state === 'failed') return body
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`task ${taskId} did not finish within ${timeoutMs} ms`)
}

export const runTask = async (method: string, path: string, body?: unknown) =>
  waitForTask(await startTask(method, path, body))

/** Direct access to the test queues, e.g. to park a task so a second request sees it as running. */
export const testQueue = (name: 'scans' | 'mail' | 'background') => {
  const url = new URL(TEST_REDIS_URL)
  return new Queue(name, { connection: { host: url.hostname, port: Number(url.port || 6379), db: Number(url.pathname.slice(1) || 0) } })
}

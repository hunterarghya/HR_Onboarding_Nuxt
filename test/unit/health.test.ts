import { beforeEach, describe, expect, it, vi } from 'vitest'

const pingDatabase = vi.fn()
const pingQdrant = vi.fn()
const pingRedis = vi.fn()
const llmPing = vi.fn()

vi.mock('~~/server/core/db/pool', () => ({ pingDatabase }))
vi.mock('~~/server/integrations/qdrant/qdrant.client', () => ({ pingQdrant }))
vi.mock('~~/server/core/tasks/queues', () => ({ pingRedis }))
vi.mock('~~/server/integrations/llm', () => ({ getLlm: () => ({ name: 'groq', ping: llmPing }) }))

const { healthService } = await import('../../server/features/health/health.service')

describe('healthService.check', () => {
  beforeEach(() => {
    pingDatabase.mockResolvedValue(undefined)
    pingQdrant.mockResolvedValue(undefined)
    pingRedis.mockResolvedValue(undefined)
    llmPing.mockResolvedValue(undefined)
  })

  it('is ok when everything answers', async () => {
    await expect(healthService.check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'ok', queue: 'ok', vectorStore: 'ok', llm: 'ok', llmProvider: 'groq' }
    })
  })

  it('stays ok when only optional dependencies fail', async () => {
    pingQdrant.mockRejectedValue(new Error('down'))
    pingRedis.mockRejectedValue(new Error('down'))
    llmPing.mockRejectedValue(new Error('bad key'))
    const result = await healthService.check()
    expect(result.status).toBe('ok')
    expect(result.checks).toMatchObject({ queue: 'error', vectorStore: 'error', llm: 'error' })
  })

  it('is down without the database', async () => {
    pingDatabase.mockRejectedValue(new Error('ECONNREFUSED'))
    expect((await healthService.check()).status).toBe('down')
  })
})

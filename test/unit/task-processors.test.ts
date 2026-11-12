import { beforeEach, describe, expect, it, vi } from 'vitest'

// Processors are thin: payload in, one service call out. The services are faked here.
const ingestion = { runGmailScan: vi.fn(), runFormsScan: vi.fn(), runWhatsappScan: vi.fn() }
vi.mock('~~/server/features/ingestion/ingestion.service', () => ({ ingestionService: ingestion }))

const { taskProcessors } = await import('../../server/features/tasks/task-processors')

const ctx = { reportProgress: vi.fn(async () => {}), attempt: 1 }

describe('task processors', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scan.gmail → runGmailScan(userId, progress)', async () => {
    ingestion.runGmailScan.mockResolvedValue({ message: 'Email scan complete', count: 2 })
    await expect(taskProcessors['scan.gmail']!({ userId: 4 }, ctx)).resolves.toEqual({ message: 'Email scan complete', count: 2 })
    expect(ingestion.runGmailScan).toHaveBeenCalledWith(4, ctx.reportProgress)
  })

  it('scan.forms → runFormsScan(userId, formIds, progress)', async () => {
    await taskProcessors['scan.forms']!({ userId: 4, formIds: ['f1'] }, ctx)
    expect(ingestion.runFormsScan).toHaveBeenCalledWith(4, ['f1'], ctx.reportProgress)
  })

  it('scan.whatsapp → runWhatsappScan(userId, groupIds, progress)', async () => {
    await taskProcessors['scan.whatsapp']!({ userId: 4, groupIds: ['g@g.us'] }, ctx)
    expect(ingestion.runWhatsappScan).toHaveBeenCalledWith(4, ['g@g.us'], ctx.reportProgress)
  })

  it('a failing service fails the task (so BullMQ retries it)', async () => {
    ingestion.runGmailScan.mockRejectedValue(new Error('Email scan failed: invalid_grant'))
    await expect(taskProcessors['scan.gmail']!({ userId: 4 }, ctx)).rejects.toThrow('invalid_grant')
  })
})

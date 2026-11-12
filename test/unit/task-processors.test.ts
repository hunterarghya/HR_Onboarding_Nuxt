import { beforeEach, describe, expect, it, vi } from 'vitest'

// Processors are thin: payload in, one service call out. The services are faked here.
const ingestion = { runGmailScan: vi.fn(), runFormsScan: vi.fn(), runWhatsappScan: vi.fn() }
vi.mock('~~/server/features/ingestion/ingestion.service', () => ({ ingestionService: ingestion }))
const calendarSync = { runSync: vi.fn() }
vi.mock('~~/server/features/interviews/calendar-sync.service', () => ({ calendarSyncService: calendarSync }))
const mail = { runEventInvites: vi.fn(), runAllInvites: vi.fn(), runOffers: vi.fn() }
vi.mock('~~/server/features/mail/mail.service', () => ({ mailService: mail }))
const jobRoles = { resyncAllVectors: vi.fn(), syncJobVector: vi.fn(), removeJobVector: vi.fn() }
vi.mock('~~/server/features/job-roles/job-roles.service', () => ({ jobRolesService: jobRoles }))

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

  it('calendar.sync → runSync(userId, progress)', async () => {
    await taskProcessors['calendar.sync']!({ userId: 4 }, ctx)
    expect(calendarSync.runSync).toHaveBeenCalledWith(4, ctx.reportProgress)
  })

  it('mail.* → the matching mail service run function', async () => {
    await taskProcessors['mail.invites']!({ userId: 4, eventId: 9, templateId: 2 }, ctx)
    await taskProcessors['mail.invitesAll']!({ userId: 4, templateId: 2 }, ctx)
    await taskProcessors['mail.offers']!({ userId: 4, templateId: 3, candidateIds: [7, 8] }, ctx)
    expect(mail.runEventInvites).toHaveBeenCalledWith(4, 9, 2, ctx.reportProgress)
    expect(mail.runAllInvites).toHaveBeenCalledWith(4, 2, ctx.reportProgress)
    expect(mail.runOffers).toHaveBeenCalledWith(4, 3, [7, 8], ctx.reportProgress)
  })

  it('vectors.* → job-roles index maintenance', async () => {
    await taskProcessors['vectors.resyncAll']!({}, ctx)
    await taskProcessors['vectors.syncJob']!({ jobId: 5 }, ctx)
    await taskProcessors['vectors.removeJob']!({ jobId: 6 }, ctx)
    expect(jobRoles.resyncAllVectors).toHaveBeenCalled()
    expect(jobRoles.syncJobVector).toHaveBeenCalledWith(5)
    expect(jobRoles.removeJobVector).toHaveBeenCalledWith(6)
  })

  it('registers a processor for every task name', async () => {
    const { QUEUE_OF } = await import('../../server/core/tasks/queues')
    expect(Object.keys(taskProcessors).sort()).toEqual(Object.keys(QUEUE_OF).sort())
  })

  it('a failing service fails the task (so BullMQ retries it)', async () => {
    ingestion.runGmailScan.mockRejectedValue(new Error('Email scan failed: invalid_grant'))
    await expect(taskProcessors['scan.gmail']!({ userId: 4 }, ctx)).rejects.toThrow('invalid_grant')
  })
})

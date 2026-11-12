import { beforeEach, describe, expect, it, vi } from 'vitest'

// Renewal of Google Calendar push channels (SEC-08), with Google and the database faked.

const DAY = 24 * 3600 * 1000
let channels: Array<{ id: number, user_id: number, channel_id: string, resource_id: string, token_hash: string, expires_at: Date }>
const watchEvents = vi.fn()
const stopChannel = vi.fn()

vi.mock('~~/server/config/env', () => ({ config: { app: { publicBaseUrl: 'https://hr.example.com' } } }))
vi.mock('~~/server/features/auth/google-auth.service', () => ({ googleAuthService: { getAuthClientForUser: async () => ({}) } }))
vi.mock('~~/server/features/interviews/calendar-sync.service', () => ({ calendarSyncService: { enqueueSync: vi.fn() } }))
vi.mock('~~/server/integrations/google/calendar.client', () => ({ watchEvents, stopChannel }))
vi.mock('~~/server/features/interviews/calendar-channels.repository', () => ({
  calendarChannelsRepository: {
    insert: async (c: typeof channels[number]) => {
      const row = { ...c, id: channels.length + 100 }
      channels.push(row)
      return row
    },
    findOthersForUser: async (userId: number, keep: string) => channels.filter(c => c.user_id === userId && c.channel_id !== keep),
    findExpiringBefore: async (before: Date) => channels.filter(c => c.expires_at < before),
    deleteById: async (id: number) => {
      channels = channels.filter(c => c.id !== id)
    }
  }
}))
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

const { calendarWebhookService } = await import('../../server/features/interviews/calendar-webhook.service')

const channel = (id: number, userId: number, expiresInMs: number) =>
  ({ id, user_id: userId, channel_id: `old-${id}`, resource_id: `res-${id}`, token_hash: 'x', expires_at: new Date(Date.now() + expiresInMs) })

describe('renewing calendar channels', () => {
  beforeEach(() => {
    watchEvents.mockReset().mockResolvedValue({ resourceId: 'res-new', expiresAt: new Date(Date.now() + 7 * DAY) })
    stopChannel.mockReset().mockResolvedValue(undefined)
  })

  it('replaces channels that expire within two days, and stops the old ones at Google', async () => {
    channels = [channel(1, 7, DAY), channel(2, 8, 5 * DAY)]
    await expect(calendarWebhookService.renewExpiring()).resolves.toEqual({ renewed: 1, failed: 0 })
    expect(watchEvents).toHaveBeenCalledWith({}, expect.any(String), 'https://hr.example.com/api/interviews/webhook', expect.stringMatching(/^[0-9a-f]{64}$/))
    expect(stopChannel).toHaveBeenCalledWith({}, 'old-1', 'res-1')
    expect(channels.map(c => c.user_id).sort()).toEqual([7, 8]) // one each: user 7's is new
    expect(channels.find(c => c.user_id === 7)!.channel_id).not.toBe('old-1')
  })

  it('keeps a still-working channel when Google refuses the renewal, and drops an expired one', async () => {
    watchEvents.mockRejectedValue(new Error('quota'))
    channels = [channel(1, 7, DAY), channel(2, 8, -DAY)]
    await expect(calendarWebhookService.renewExpiring()).resolves.toEqual({ renewed: 0, failed: 2 })
    expect(channels.map(c => c.id)).toEqual([1])
  })

  it('stores only a hash of the token Google sends back', async () => {
    channels = []
    await calendarWebhookService.register(9)
    const token = watchEvents.mock.calls[0]![3] as string
    expect(channels[0]!.token_hash).not.toContain(token)
    expect(channels[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

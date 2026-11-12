import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { config } from '~~/server/config/env'
import { AppError, ConflictError, UnauthorizedError, ValidationError } from '~~/server/core/errors/app-error'
import { stopChannel, watchEvents } from '~~/server/integrations/google/calendar.client'
import { googleAuthService } from '../auth/google-auth.service'
import { calendarChannelsRepository, type CalendarChannelRow } from './calendar-channels.repository'
import { calendarSyncService } from './calendar-sync.service'

// Google Calendar push notifications (SEC-08). An HR registers a channel; Google then calls
// POST /api/interviews/webhook whenever their calendar changes, sending back the channel's secret
// token. A genuine "calendar changed" notice starts a calendar sync for that HR. Channels expire
// (Google's limit is about a week), so a daily task renews the ones close to expiring.

export const WEBHOOK_PATH = '/api/interviews/webhook'
/** Channels expiring within this window are renewed by the daily task. */
const RENEW_WITHIN_MS = 2 * 24 * 3600 * 1000

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

const sameHash = (a: string, b: string) => {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Stops a channel at Google (best effort: it expires on its own anyway) and forgets it. */
const retire = async (channel: CalendarChannelRow) => {
  try {
    await stopChannel(await googleAuthService.getAuthClientForUser(channel.user_id), channel.channel_id, channel.resource_id)
  } catch (err) {
    console.warn(`--- [Calendar] Could not stop channel ${channel.channel_id}: ${(err as Error).message} ---`)
  }
  await calendarChannelsRepository.deleteById(channel.id)
}

/** Opens a new channel for the user and retires their older ones. */
const openChannel = async (userId: number) => {
  if (!config.app.publicBaseUrl) {
    throw new ValidationError(null, 'Push notifications need PUBLIC_BASE_URL (the https address Google can reach this app on)')
  }
  const auth = await googleAuthService.getAuthClientForUser(userId)
  const channelId = randomUUID()
  const token = randomBytes(32).toString('hex')

  let watched: Awaited<ReturnType<typeof watchEvents>>
  try {
    watched = await watchEvents(auth, channelId, `${config.app.publicBaseUrl}${WEBHOOK_PATH}`, token)
  } catch (err) {
    console.error('Error registering webhook:', err)
    throw new AppError(500, 'WEBHOOK_REGISTER_FAILED', 'Failed to register webhook')
  }

  const channel = await calendarChannelsRepository.insert({
    user_id: userId,
    channel_id: channelId,
    resource_id: watched.resourceId,
    token_hash: hashToken(token),
    expires_at: watched.expiresAt
  })
  for (const old of await calendarChannelsRepository.findOthersForUser(userId, channelId)) await retire(old)

  console.log(`--- [Calendar] Webhook channel ${channelId} open until ${channel.expires_at.toISOString()} ---`)
  return channel
}

export const calendarWebhookService = {
  /** POST /api/interviews/register-webhook */
  async register(userId: number) {
    const channel = await openChannel(userId)
    return { message: 'Webhook registered', channelId: channel.channel_id, expiresAt: channel.expires_at }
  },

  /**
   * A push notification. Unknown channels and wrong tokens are refused (401). The first "sync" message
   * only confirms the channel; any other state means the calendar changed, so a sync is queued (or the
   * one already running covers it).
   */
  async handleNotification(headers: { channelId?: string, token?: string, resourceState?: string }) {
    const channel = headers.channelId ? await calendarChannelsRepository.findByChannelId(headers.channelId) : null
    if (!channel || !headers.token || !sameHash(hashToken(headers.token), channel.token_hash)) {
      throw new UnauthorizedError('Unknown calendar channel')
    }
    if (headers.resourceState === 'sync') return { message: 'Channel confirmed' }

    try {
      await calendarSyncService.enqueueSync(channel.user_id)
      return { message: 'Calendar sync queued' }
    } catch (err) {
      if (err instanceof ConflictError) return { message: 'Calendar sync already running' }
      throw err
    }
  },

  /** Task calendar.renewChannels (daily): channels expiring soon are replaced by new ones. */
  async renewExpiring() {
    const due = await calendarChannelsRepository.findExpiringBefore(new Date(Date.now() + RENEW_WITHIN_MS))
    let renewed = 0, failed = 0
    for (const channel of due) {
      try {
        await openChannel(channel.user_id)
        renewed++
      } catch (err) {
        failed++
        console.error(`--- [Calendar] Could not renew channel ${channel.channel_id} for user ${channel.user_id}: ${(err as Error).message} ---`)
        // an expired channel is useless; one that still works is kept for the next attempt
        if (channel.expires_at.getTime() < Date.now()) await calendarChannelsRepository.deleteById(channel.id)
      }
    }
    return { renewed, failed }
  }
}

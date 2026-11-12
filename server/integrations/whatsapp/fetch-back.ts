// whatsapp-web.js can only fetch "the last N messages" of a chat, with no page cursor. To read everything
// since the last scan, ask for more and more until the oldest message returned is from before it.

/** First and largest number of messages asked for. */
export const FIRST_BATCH = 100
export const MAX_MESSAGES = 2000

/**
 * The chat's messages back to `since` (all of them, up to MAX_MESSAGES, when there's no `since`).
 * `fetchLast(n)` returns the last n messages, oldest first, with timestamps in seconds.
 */
export const fetchMessagesSince = async <M extends { timestamp: number }>(
  fetchLast: (limit: number) => Promise<M[]>,
  since: Date | null,
  maxMessages = MAX_MESSAGES
): Promise<M[]> => {
  let limit = Math.min(FIRST_BATCH, maxMessages)
  for (;;) {
    const messages = await fetchLast(limit)
    const reachedStartOfChat = messages.length < limit
    const reachedSince = since !== null && messages.length > 0 && messages[0]!.timestamp * 1000 <= since.getTime()
    if (reachedStartOfChat || reachedSince || limit >= maxMessages) {
      if (!reachedStartOfChat && !reachedSince && since !== null) {
        console.warn(`--- WhatsApp: more than ${maxMessages} messages since the last scan; older ones are not read ---`)
      }
      return messages
    }
    limit = Math.min(limit * 2, maxMessages)
  }
}

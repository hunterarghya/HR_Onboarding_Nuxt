import { describe, expect, it, vi } from 'vitest'
import { fetchMessagesSince } from '../../server/integrations/whatsapp/fetch-back'

vi.spyOn(console, 'warn').mockImplementation(() => {})

/** A chat with `count` messages, one a minute, ending at 12:00 (timestamps in seconds) */
const chat = (count: number) => {
  const end = Date.UTC(2030, 0, 15, 12) / 1000
  const all = Array.from({ length: count }, (_, i) => ({ timestamp: end - (count - 1 - i) * 60 }))
  const fetchLast = vi.fn(async (limit: number) => all.slice(-limit))
  return { all, fetchLast }
}

describe('fetchMessagesSince', () => {
  it('reads back past the last 100 messages until the last scan (they were skipped)', async () => {
    const { all, fetchLast } = chat(1000)
    const since = new Date(all[650]!.timestamp * 1000) // 349 messages since then
    const messages = await fetchMessagesSince(fetchLast, since)
    expect(messages.filter(m => m.timestamp * 1000 > since.getTime())).toHaveLength(349)
    expect(fetchLast.mock.calls.map(c => c[0])).toEqual([100, 200, 400])
  })

  it('stops at once when the first batch already reaches the last scan', async () => {
    const { all, fetchLast } = chat(1000)
    await fetchMessagesSince(fetchLast, new Date(all[950]!.timestamp * 1000))
    expect(fetchLast).toHaveBeenCalledTimes(1)
  })

  it('stops at the start of a short chat', async () => {
    const { fetchLast } = chat(150)
    expect(await fetchMessagesSince(fetchLast, null)).toHaveLength(150)
    expect(fetchLast.mock.calls.map(c => c[0])).toEqual([100, 200])
  })

  it('never asks for more than the cap', async () => {
    const { fetchLast } = chat(5000)
    expect(await fetchMessagesSince(fetchLast, new Date(0), 2000)).toHaveLength(2000)
    expect(fetchLast.mock.calls.map(c => c[0])).toEqual([100, 200, 400, 800, 1600, 2000])
  })
})

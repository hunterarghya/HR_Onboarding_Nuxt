import { LlmError, type LlmProviderName } from '../llm.types'

interface RequestOpts { timeoutMs: number, headers?: Record<string, string> }

/** POSTs JSON with a hard timeout and turns every failure into an LlmError. */
export const postJson = <T>(provider: LlmProviderName, url: string, body: unknown, opts: RequestOpts): Promise<T> =>
  requestJson(provider, url, { method: 'POST', body: JSON.stringify(body) }, opts)

/** GETs JSON with a hard timeout (used for health pings). */
export const getJson = <T>(provider: LlmProviderName, url: string, opts: RequestOpts): Promise<T> =>
  requestJson(provider, url, { method: 'GET' }, opts)

const requestJson = async <T>(provider: LlmProviderName, url: string, init: { method: string, body?: string }, opts: RequestOpts): Promise<T> => {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', ...opts.headers },
      signal: AbortSignal.timeout(opts.timeoutMs)
    })
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    throw new LlmError(provider, timedOut ? `timed out after ${opts.timeoutMs} ms` : `request failed: ${(err as Error)?.message ?? err}`, undefined, { cause: err })
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new LlmError(provider, `HTTP ${res.status}${detail ? `: ${detail}` : ''}`, res.status)
  }

  try {
    return await res.json() as T
  } catch (err) {
    throw new LlmError(provider, 'response was not JSON', res.status, { cause: err })
  }
}

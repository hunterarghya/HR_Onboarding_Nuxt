import { LlmError, type LlmErrorKind, type LlmProviderName } from '../llm.types'

interface RequestOpts { timeoutMs: number, headers?: Record<string, string> }

/** POSTs JSON with a hard timeout and turns every failure into an LlmError. */
export const postJson = <T>(provider: LlmProviderName, url: string, body: unknown, opts: RequestOpts): Promise<T> =>
  requestJson(provider, url, { method: 'POST', body: JSON.stringify(body) }, opts)

/** GETs JSON with a hard timeout (used for health pings). */
export const getJson = <T>(provider: LlmProviderName, url: string, opts: RequestOpts): Promise<T> =>
  requestJson(provider, url, { method: 'GET' }, opts)

/**
 * What an HTTP error means for the HR. Gemini reports a bad key as 400 API_KEY_INVALID and a used-up
 * quota as 429 RESOURCE_EXHAUSTED; Groq uses 401 and 429.
 */
export const errorKind = (status: number, body: string): LlmErrorKind => {
  if (status === 401 || status === 403 || /API_KEY_INVALID|invalid[_ ]api[_ ]key/i.test(body)) return 'auth'
  if (status === 429 || /RESOURCE_EXHAUSTED|rate[_ ]limit|quota/i.test(body)) return 'quota'
  if (status >= 500) return 'unavailable'
  return 'bad_response'
}

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
    throw new LlmError(provider, timedOut ? `timed out after ${opts.timeoutMs} ms` : `request failed: ${(err as Error)?.message ?? err}`, undefined, { cause: err, kind: 'unavailable' })
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new LlmError(provider, `HTTP ${res.status}${detail ? `: ${detail}` : ''}`, res.status, { kind: errorKind(res.status, detail) })
  }

  try {
    return await res.json() as T
  } catch (err) {
    throw new LlmError(provider, 'response was not JSON', res.status, { cause: err, kind: 'bad_response' })
  }
}

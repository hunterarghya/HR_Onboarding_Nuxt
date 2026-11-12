import { LlmError, type LlmProviderName } from '../llm.types'

/** POSTs JSON with a hard timeout and turns every failure into an LlmError. */
export const postJson = async (
  provider: LlmProviderName,
  url: string,
  body: unknown,
  opts: { timeoutMs: number, headers?: Record<string, string> }
): Promise<any> => {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...opts.headers },
      body: JSON.stringify(body),
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
    return await res.json()
  } catch (err) {
    throw new LlmError(provider, 'response was not JSON', res.status, { cause: err })
  }
}

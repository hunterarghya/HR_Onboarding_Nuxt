import { expect, inject } from 'vitest'
import { userToken } from './tokens'

export interface ApiResponse<T = any> {
  status: number
  headers: Headers
  body: T
}

interface RequestOptions {
  /** Defaults to a valid session; pass `null` to send no Authorization header. */
  token?: string | null
  body?: unknown
  query?: Record<string, string | number | boolean>
  headers?: Record<string, string>
}

export const api = async <T = any>(method: string, path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> => {
  const url = new URL(path, inject('baseURL'))
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v))

  const headers: Record<string, string> = { ...opts.headers }
  const token = opts.token === undefined ? userToken() : opts.token
  if (token) headers.authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['content-type'] = 'application/json'

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: 'manual'
  })

  const text = await res.text()
  let body: any = text
  if (res.headers.get('content-type')?.includes('json') && text) body = JSON.parse(text)
  return { status: res.status, headers: res.headers, body }
}

/** The h3 error shape the frontend reads today (`statusMessage`, optional `data`). */
export const expectError = (res: ApiResponse, statusCode: number, statusMessage?: string) => {
  expect(res.status).toBe(statusCode)
  expect(res.body).toMatchObject({ statusCode })
  if (statusMessage !== undefined) expect(res.body.statusMessage).toBe(statusMessage)
}

import { it } from 'vitest'
import { api, expectError } from './http'
import { tokenWithWrongSecret } from './tokens'

export { userToken } from './tokens'

/** Every non-public route: no session → 401, and a token signed with another secret → 401. */
export const itRequiresLogin = (method: string, path: string, body?: unknown) => {
  it('rejects a request without a token (401)', async () => {
    expectError(await api(method, path, { body, token: null }), 401, 'Unauthorized')
  })

  it('rejects a token signed with another secret (401)', async () => {
    expectError(await api(method, path, { body, token: tokenWithWrongSecret() }), 401, 'Invalid or expired session')
  })
}

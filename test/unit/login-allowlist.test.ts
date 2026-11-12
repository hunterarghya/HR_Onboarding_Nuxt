import { describe, expect, it } from 'vitest'
import { isEmailAllowed } from '../../server/core/auth/login-allowlist'

const allowlist = { domains: ['ripplewalk.com'], emails: ['lead@gmail.com'] }

describe('isEmailAllowed', () => {
  it('allows listed domains and listed addresses, case-insensitively', () => {
    expect(isEmailAllowed('anyone@ripplewalk.com', allowlist)).toBe(true)
    expect(isEmailAllowed('Lead@Gmail.com', allowlist)).toBe(true)
  })

  it('refuses everything else, including look-alike domains', () => {
    expect(isEmailAllowed('other@gmail.com', allowlist)).toBe(false)
    expect(isEmailAllowed('x@ripplewalk.com.evil.io', allowlist)).toBe(false)
    expect(isEmailAllowed('x@notripplewalk.com', allowlist)).toBe(false)
  })
})

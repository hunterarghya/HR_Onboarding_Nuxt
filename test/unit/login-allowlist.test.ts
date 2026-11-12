import { describe, expect, it } from 'vitest'
import { isEmailAllowed } from '../../server/core/auth/login-allowlist'

const allowlist = { domains: ['odysseus.example'], emails: ['lead@gmail.com'] }

describe('isEmailAllowed', () => {
  it('allows listed domains and listed addresses, case-insensitively', () => {
    expect(isEmailAllowed('anyone@odysseus.example', allowlist)).toBe(true)
    expect(isEmailAllowed('Lead@Gmail.com', allowlist)).toBe(true)
  })

  it('refuses everything else, including look-alike domains', () => {
    expect(isEmailAllowed('other@gmail.com', allowlist)).toBe(false)
    expect(isEmailAllowed('x@odysseus.example.evil.io', allowlist)).toBe(false)
    expect(isEmailAllowed('x@notodysseus.example', allowlist)).toBe(false)
  })
})

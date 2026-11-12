import { describe, expect, it } from 'vitest'
import { decrypt, encrypt } from '../../server/core/crypto'

const KEY = 'a'.repeat(64)
const OTHER_KEY = 'b'.repeat(64)

describe('crypto', () => {
  it('round-trips text, including unicode', () => {
    const secret = '1//0refresh-token-ünïcødé'
    expect(decrypt(encrypt(secret, KEY), KEY)).toBe(secret)
  })

  it('uses a fresh IV every time, so equal inputs encrypt differently', () => {
    expect(encrypt('same', KEY)).not.toBe(encrypt('same', KEY))
  })

  it('stores a versioned, url-safe value that does not contain the secret', () => {
    const value = encrypt('ya29.access-token', KEY)
    expect(value).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/)
    expect(value).not.toContain('ya29')
  })

  it('rejects the wrong key and tampered data', () => {
    const value = encrypt('secret', KEY)
    expect(() => decrypt(value, OTHER_KEY)).toThrow()

    const [v, iv, tag, ct] = value.split('.')
    const flipped = Buffer.from(ct!, 'base64url')
    flipped[0] = flipped[0]! ^ 1
    expect(() => decrypt([v, iv, tag, flipped.toString('base64url')].join('.'), KEY)).toThrow()
  })

  it('rejects malformed values and keys', () => {
    expect(() => decrypt('plain-text-token', KEY)).toThrow('Unrecognised encrypted value')
    expect(() => encrypt('x', 'abcd')).toThrow('64 hex characters')
  })
})

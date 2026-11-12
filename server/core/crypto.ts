import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// AES-256-GCM for secrets stored in the database (Google OAuth tokens). GCM authenticates the data,
// so a tampered or wrong-key value fails to decrypt instead of returning garbage.
// Stored form: "v1.<iv>.<auth tag>.<ciphertext>", each part base64url. The version prefix lets the
// format or key change later without guessing.

const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v1'
const IV_BYTES = 12

const toKey = (keyHex: string): Buffer => {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex characters)')
  return key
}

export const encrypt = (plaintext: string, keyHex: string): string => {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, toKey(keyHex), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}

/** Throws if the value was not produced by `encrypt` with this key, or was altered. */
export const decrypt = (payload: string, keyHex: string): string => {
  const [version, iv, tag, ciphertext] = payload.split('.')
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error('Unrecognised encrypted value')

  const decipher = createDecipheriv(ALGORITHM, toKey(keyHex), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
}

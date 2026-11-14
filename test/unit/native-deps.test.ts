import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

// @xenova/transformers loads sharp as soon as it's imported. pnpm 10 skips install scripts unless
// pnpm-workspace.yaml allows them, and sharp's script is what fetches its native binary; without it the
// embedding model never loads, so every resume ends up in "Open" with score 0 (BUG-24).
describe('native dependencies', () => {
  it('sharp is installed with its native binary, as the embedding library needs', () => {
    const fromTransformers = createRequire(createRequire(import.meta.url).resolve('@xenova/transformers'))
    expect(() => fromTransformers('sharp')).not.toThrow()
  })

  it('the embedding library loads', async () => {
    await expect(import('@xenova/transformers')).resolves.toHaveProperty('pipeline')
  })
})

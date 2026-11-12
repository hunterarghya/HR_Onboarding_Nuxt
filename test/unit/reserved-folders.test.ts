import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from '../helpers/routes'

// Nitro gives these server/ folders special meaning: files in server/modules are loaded as *build*
// modules during `nuxt prepare` / `nuxt build`, and server/tasks become Nitro tasks. Feature code
// placed there runs at install time (that broke CI once). Features live in server/features.
describe('reserved Nitro folders', () => {
  it.each(['modules', 'tasks'])('server/%s is not used for app code', (dir) => {
    expect(existsSync(join(ROOT, 'server', dir))).toBe(false)
  })
})

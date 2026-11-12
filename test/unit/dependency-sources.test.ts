import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from '../helpers/routes'

// A dependency taken from a branch URL (e.g. github.com/…/tarball/main) changes whenever upstream
// pushes. The lockfile's checksum then stops matching and every fresh install fails (this broke CI
// once). Only published registry versions are allowed: they never change once released.
describe('dependency sources', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const all: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies }

  it.each(Object.entries(all))('%s comes from the registry (%s)', (_name, spec) => {
    expect(spec).not.toMatch(/^(https?:|git(\+\w+)?:|github:|file:|link:)|\.tgz$|#/)
  })
})

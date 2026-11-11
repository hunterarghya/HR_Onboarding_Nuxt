/**
 * Every Nitro route file must have a smoke test, and every smoke test must point at a real route.
 * A route is "covered" when some file in test/api has `describe('<METHOD> <path>', ...)`, with the
 * path written the way Nitro serves it: `index` dropped and `[param]` written as `:param`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../..')

const ROUTE_DIRS = [
  { dir: 'server/api', prefix: '/api' },
  { dir: 'server/routes', prefix: '' }
]

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

const listFiles = (dir: string) =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith('.ts'))
    .map(f => f.replaceAll('\\', '/'))

/** `jobs/[id].patch.ts` → `PATCH /api/jobs/:id`; `jobs/index.get.ts` → `GET /api/jobs`. */
const routeTitle = (file: string, prefix: string) => {
  const parts = file.replace(/\.ts$/, '').split('/')
  const [name = '', method] = parts.pop()!.split('.')
  if (!method || !METHODS.includes(method)) throw new Error(`Route file without an HTTP method suffix: ${file}`)
  const segments = [...parts, name]
    .filter(s => s !== 'index')
    .map(s => s.replace(/^\[\.\.\.(.+)\]$/, '**:$1').replace(/^\[(.+)\]$/, ':$1'))
  return `${method.toUpperCase()} ${prefix}/${segments.join('/')}`
}

const routes = ROUTE_DIRS.flatMap(({ dir, prefix }) =>
  listFiles(dir).map(file => ({ file: `${dir}/${file}`, title: routeTitle(file, prefix) }))
)

const testedTitles = new Set(
  listFiles('test/api')
    .filter(f => f.endsWith('.test.ts'))
    .flatMap(f => [...readFileSync(join(ROOT, 'test/api', f), 'utf8').matchAll(/describe\('((?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \/[^']*)'/g)])
    .map(m => m[1]!)
)

describe('route inventory', () => {
  it('maps file names the way Nitro does', () => {
    expect(routeTitle('jobs/index.get.ts', '/api')).toBe('GET /api/jobs')
    expect(routeTitle('interviews/events/[id]/candidates/manual.patch.ts', '/api')).toBe('PATCH /api/interviews/events/:id/candidates/manual')
    expect(routeTitle('auth/google/callback.get.ts', '')).toBe('GET /auth/google/callback')
  })

  it('finds the route files', () => {
    expect(routes.length).toBeGreaterThan(40)
  })

  it('has a smoke test for every route file', () => {
    const missing = routes.filter(r => !testedTitles.has(r.title)).map(r => `${r.title}  (${r.file})`)
    expect(missing, 'add a describe(\'<METHOD> <path>\') block in test/api for each').toEqual([])
  })

  it('has no smoke tests for routes that no longer exist', () => {
    const known = new Set(routes.map(r => r.title))
    expect([...testedTitles].filter(t => !known.has(t))).toEqual([])
  })
})

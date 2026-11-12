import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const ROOT = resolve(import.meta.dirname, '../..')

const ROUTE_DIRS = [
  { dir: 'server/api', prefix: '/api' },
  { dir: 'server/routes', prefix: '' }
]

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

export const listFiles = (dir: string) =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith('.ts'))
    .map(f => f.replaceAll('\\', '/'))

/** `jobs/[id].patch.ts` → `PATCH /api/jobs/:id`; `jobs/index.get.ts` → `GET /api/jobs`. */
export const routeTitle = (file: string, prefix: string) => {
  const parts = file.replace(/\.ts$/, '').split('/')
  const [name = '', method] = parts.pop()!.split('.')
  if (!method || !METHODS.includes(method)) throw new Error(`Route file without an HTTP method suffix: ${file}`)
  const segments = [...parts, name]
    .filter(s => s !== 'index')
    .map(s => s.replace(/^\[\.\.\.(.+)\]$/, '**:$1').replace(/^\[(.+)\]$/, ':$1'))
  return `${method.toUpperCase()} ${prefix}/${segments.join('/')}`
}

export interface RouteInfo {
  file: string
  title: string
  method: string
  path: string
}

export const listRoutes = (): RouteInfo[] => ROUTE_DIRS.flatMap(({ dir, prefix }) =>
  listFiles(dir).map((file) => {
    const title = routeTitle(file, prefix)
    const [method = '', path = ''] = title.split(' ')
    return { file: `${dir}/${file}`, title, method, path }
  })
)

/**
 * Boots the app against a throwaway database for the API smoke suite.
 *
 * SMOKE_TARGET=dev (default)  `nuxt dev` with its own buildDir. Boots in seconds; the commit gate.
 * SMOKE_TARGET=build          the production bundle, rebuilt first if any source is newer than it
 *                             (a full build takes minutes). Used by CI and the phase gate.
 *
 * 1. Drops and recreates the test database (its name must end in `_test`).
 * 2. Starts the server with a fully controlled env (no `.env`), from a temp cwd so the WhatsApp
 *    LocalAuth dir (`./whatsapp-auth`) is never the real session.
 * 3. Waits until the server answers and the boot-time schema + default templates exist.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pg from 'pg'
import type { TestProject } from 'vitest/node'
import { TEST_DATABASE_URL, TEST_GOOGLE_CLIENT_ID, TEST_JWT_SECRET, UNREACHABLE_URL } from './test-env'

declare module 'vitest' {
  export interface ProvidedContext {
    baseURL: string
  }
}

const ROOT = resolve(import.meta.dirname, '../../..')
const SERVER_ENTRY = join(ROOT, '.output/server/index.mjs')
const NUXT_CLI = join(ROOT, 'node_modules/nuxt/bin/nuxt.mjs')
const TARGET = process.env.SMOKE_TARGET === 'build' ? 'build' : 'dev'
const BUILD_INPUTS = ['server', 'app', 'public', 'shared', 'nuxt.config.ts', 'package.json', 'pnpm-lock.yaml']

const newestMtime = (path: string): number => {
  if (!existsSync(path)) return 0
  const stat = statSync(path)
  if (!stat.isDirectory()) return stat.mtimeMs
  return readdirSync(path).reduce((max, entry) => Math.max(max, newestMtime(join(path, entry))), stat.mtimeMs)
}

const ensureBuild = () => {
  const builtAt = existsSync(SERVER_ENTRY) ? statSync(SERVER_ENTRY).mtimeMs : 0
  const sourcesAt = Math.max(...BUILD_INPUTS.map(p => newestMtime(join(ROOT, p))))
  if (builtAt > sourcesAt) return

  console.log('[smoke] sources changed since the last build, running `pnpm build`...')
  const result = spawnSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit', shell: true })
  if (result.status !== 0) throw new Error('`pnpm build` failed')
}

const recreateDatabase = async () => {
  const url = new URL(TEST_DATABASE_URL)
  const dbName = url.pathname.slice(1)
  if (!/^[a-z0-9_]+_test$/.test(dbName)) {
    throw new Error(`Refusing to recreate "${dbName}": the smoke-test database name must end in _test`)
  }

  url.pathname = '/postgres'
  const admin = new pg.Client({ connectionString: url.toString() })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${dbName}`)
  } finally {
    await admin.end()
  }
}

const getFreePort = () => new Promise<number>((resolvePort, reject) => {
  const srv = createServer()
  srv.once('error', reject)
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address() as { port: number }
    srv.close(() => resolvePort(port))
  })
})

const waitFor = async (what: string, check: () => Promise<boolean>, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`[smoke] timed out waiting for ${what}`)
}

export default async function setup(project: TestProject) {
  if (TARGET === 'build') ensureBuild()
  await recreateDatabase()

  const port = await getFreePort()
  const baseURL = `http://127.0.0.1:${port}`
  const workDir = mkdtempSync(join(tmpdir(), 'hr-smoke-'))

  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    NODE_ENV: TARGET === 'build' ? 'production' : 'development',
    TZ: 'UTC', // as in the Docker image; candidate cursors depend on the server timezone

    HOST: '127.0.0.1',
    PORT: String(port),
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: TEST_JWT_SECRET,
    GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: 'smoke-test-client-secret',
    GOOGLE_REDIRECT_URI: `${baseURL}/auth/google/callback`,
    QDRANT_URL: UNREACHABLE_URL,
    OLLAMA_BASE_URL: UNREACHABLE_URL,
    // Required by the config module; uploads never happen in the smoke suite.
    IMAGEKIT_PUBLIC_KEY: 'smoke-test-public-key',
    IMAGEKIT_PRIVATE_KEY: 'smoke-test-private-key',
    IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/smoke-test',
    // A browser that doesn't exist: WhatsApp init fails fast and deterministically on every machine.
    PUPPETEER_EXECUTABLE_PATH: join(workDir, 'no-chromium'),
    // No internet for the server under test: Google APIs (gaxios reads these vars) and the
    // embedding-model download (Node fetch, via NODE_USE_ENV_PROXY) fail fast instead of
    // depending on the network or reaching real services with fake tokens.
    NODE_USE_ENV_PROXY: '1',
    HTTP_PROXY: UNREACHABLE_URL,
    HTTPS_PROXY: UNREACHABLE_URL,
    NO_PROXY: '127.0.0.1,localhost'
  }

  const args = TARGET === 'build'
    ? [SERVER_ENTRY]
    // envName=test selects the `$test` block of nuxt.config (a separate buildDir); the dotenv file
    // doesn't exist, so the developer's `.env` is never loaded.
    : [NUXT_CLI, 'dev', ROOT, '--port', String(port), '--host', '127.0.0.1', '--envName', 'test', '--dotenv', '.env.smoke-none', '--no-fork']
  const server: ChildProcess = spawn(process.execPath, args, { cwd: workDir, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const logs: string[] = []
  server.stdout?.on('data', d => logs.push(String(d)))
  server.stderr?.on('data', d => logs.push(String(d)))

  const stop = () => new Promise<void>((done) => {
    if (server.exitCode !== null) return done()
    server.once('exit', () => done())
    server.kill()
  })

  try {
    await waitFor('the server to answer /api/health', async () => (await fetch(`${baseURL}/api/health`)).ok, 60_000)

    // initDb runs in a Nitro plugin that is not awaited, so the schema can lag behind the first response.
    const db = new pg.Client({ connectionString: TEST_DATABASE_URL })
    await db.connect()
    try {
      await waitFor('boot-time schema and default templates', async () => {
        const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM email_templates WHERE is_default = true')
        return rows[0].n === 3
      }, 60_000)
    } finally {
      await db.end()
    }
  } catch (err) {
    await stop()
    console.error(logs.join(''))
    throw err
  }

  project.provide('baseURL', baseURL)

  return async () => {
    await stop()
    if (process.env.SMOKE_SERVER_LOGS) console.log(logs.join(''))
    rmSync(workDir, { recursive: true, force: true })
  }
}

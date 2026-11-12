import { useStorage } from 'nitropack/runtime'
import type { Migration } from './migrator'

/**
 * The .sql files in server/database/migrations. They ship inside the server bundle as Nitro server
 * assets (see `nitro.serverAssets` in nuxt.config.ts), so the production image needs no extra files.
 */
export const loadMigrations = async (): Promise<Migration[]> => {
  const storage = useStorage('assets:migrations')
  const keys = (await storage.getKeys()).filter(k => k.endsWith('.sql'))

  return Promise.all(keys.map(async (name) => {
    // dev reads from disk (Buffer); the production bundle may inline text or bytes
    const raw = await storage.getItemRaw(name)
    const sql = typeof raw === 'string' ? raw : Buffer.from(raw as Uint8Array).toString('utf8')
    return { name, sql }
  }))
}

import { closePool } from '~~/server/core/db/pool'

export default defineNitroPlugin(async (nitroApp) => {
  console.log('[Plugin] Initializing database...')
  nitroApp.hooks.hook('close', closePool)
  await initDb()
})

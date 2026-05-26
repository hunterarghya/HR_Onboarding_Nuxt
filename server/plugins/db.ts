export default defineNitroPlugin(async () => {
  console.log('[Plugin] Initializing database...')
  await initDb()
})

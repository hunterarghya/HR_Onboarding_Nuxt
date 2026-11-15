// Nitro doesn't wait for async plugins, so anything that needs the migrated schema (the task workers)
// waits for this instead. plugins/10.database.ts settles it once migrations have run (or failed).

let markReady: () => void = () => {}

export const databaseReady: Promise<void> = new Promise((resolve) => {
  markReady = resolve
})

export const markDatabaseReady = () => markReady()

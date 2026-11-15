import { closePool, getPool } from '~~/server/core/db/pool'
import { markDatabaseReady } from '~~/server/core/db/ready'
import { loadMigrations } from '~~/server/database/migration-files'
import { runMigrations } from '~~/server/database/migrator'
import { seedDefaultTemplates } from '~~/server/database/seed'
import { jobRolesService } from '~~/server/features/job-roles/job-roles.service'

export default defineNitroPlugin(async (nitroApp) => {
  console.log('[Plugin] Initializing database...')
  nitroApp.hooks.hook('close', closePool)
  try {
    const applied = await runMigrations(getPool(), await loadMigrations())
    console.log(applied.length > 0 ? `Database migrations applied: ${applied.join(', ')}` : 'Database schema up to date')

    await seedDefaultTemplates()
    // Re-index job descriptions in the background; the server answers requests meanwhile
    await jobRolesService.queueResyncAllVectors()
  } catch (err) {
    // The server keeps running so /api/health can report the database problem
    console.error('Error initializing database:', err)
  } finally {
    // the task workers start now, so they never run against a half-migrated schema
    markDatabaseReady()
  }
})

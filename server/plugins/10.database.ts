import { closePool } from '~~/server/core/db/pool'
import { bootstrapSchema } from '~~/server/database/schema'
import { jobRolesService } from '~~/server/modules/job-roles/job-roles.service'

export default defineNitroPlugin(async (nitroApp) => {
  console.log('[Plugin] Initializing database...')
  nitroApp.hooks.hook('close', closePool)
  try {
    await bootstrapSchema()
    await jobRolesService.resyncAllVectors()
  } catch (err) {
    console.error('Error initializing database:', err)
  }
})

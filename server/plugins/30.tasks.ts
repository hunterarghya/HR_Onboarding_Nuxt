import { config } from '~~/server/config/env'
import { roleDuties } from '~~/server/core/app-role'
import { closeQueues } from '~~/server/core/tasks/queues'
import { startWorkers, stopWorkers } from '~~/server/core/tasks/registry'
import { taskProcessors } from '~~/server/features/tasks/task-processors'

// Workers run only where APP_ROLE asks for them. On shutdown (and on every dev hot reload) they are
// closed first, so a reload never leaves a second set of workers running.
export default defineNitroPlugin((nitroApp) => {
  if (roleDuties(config.app.role).runsWorkers) {
    console.log(`[Plugin] Starting task workers (APP_ROLE=${config.app.role})...`)
    startWorkers(taskProcessors)
  }
  nitroApp.hooks.hook('close', async () => {
    await stopWorkers()
    await closeQueues()
  })
})

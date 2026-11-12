import { z } from 'zod'
import { NotFoundError } from '~~/server/core/errors/app-error'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseParams } from '~~/server/core/http/validate'
import { findTask } from '~~/server/core/tasks/queues'
import { toTaskStatus } from '~~/server/core/tasks/task-status'

const TaskIdParams = z.object({ id: z.string().min(1).max(200) })

export const tasksController = {
  /** What the UI polls while a background task runs: state, progress, and the result or error. */
  status: defineApiHandler(async (event) => {
    const { id } = parseParams(event, TaskIdParams)
    const job = await findTask(id)
    if (!job) throw new NotFoundError('Task')
    return toTaskStatus(job)
  })
}

import { z } from 'zod'
import { NotFoundError } from '~~/server/core/errors/app-error'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseParams, parseQuery } from '~~/server/core/http/validate'
import { findTask, listRecentTasks } from '~~/server/core/tasks/queues'
import { toTaskStatus } from '~~/server/core/tasks/task-status'

const TaskIdParams = z.object({ id: z.string().min(1).max(200) })
const ListTasksQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) })

export const tasksController = {
  /** GET /api/tasks: every queue's counts and its latest tasks, for the Tasks page. */
  list: defineApiHandler(async (event) => {
    const { limit } = parseQuery(event, ListTasksQuery)
    const queues = await listRecentTasks(limit)
    return Promise.all(queues.map(async q => ({
      queue: q.queue,
      counts: q.counts,
      tasks: await Promise.all(q.jobs.map(job => toTaskStatus(job, () => findTask(job.id!))))
    })))
  }),

  /** What the UI polls while a background task runs: state, progress, and the result or error. */
  status: defineApiHandler(async (event) => {
    const { id } = parseParams(event, TaskIdParams)
    const job = await findTask(id)
    if (!job) throw new NotFoundError('Task')
    return toTaskStatus(job, () => findTask(id))
  })
}

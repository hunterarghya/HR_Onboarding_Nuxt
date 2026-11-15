import { Queue, type Job } from 'bullmq'
import { config } from '~~/server/config/env'
import { ConflictError } from '../errors/app-error'
import { redisConnection } from './connection'

// Every background task the app knows, with the payload it carries. Payloads hold ids only
// (never tokens or personal data): the worker loads what it needs from the database.
export interface TaskPayloads {
  'scan.gmail': { userId: number }
  'scan.forms': { userId: number, formIds: string[] }
  'scan.whatsapp': { userId: number, groupIds: string[] }
  'calendar.sync': { userId: number }
  'calendar.renewChannels': Record<string, never>
  'mail.invites': { userId: number, eventId: number, templateId: number }
  'mail.invitesAll': { userId: number, templateId: number }
  'mail.offers': { userId: number, templateId: number, candidateIds: number[] }
  'vectors.syncJob': { jobId: number }
  'vectors.removeJob': { jobId: number }
  'vectors.resyncAll': Record<string, never>
}
export type TaskName = keyof TaskPayloads

/**
 * Three queues, so slow work can't hold up urgent work:
 * scans (minutes, CPU-heavy embeddings), mail (one batch at a time, so no two batches can mail the
 * same candidate at once), background (calendar sync, job-description embeddings).
 */
export const QUEUE_NAMES = ['scans', 'mail', 'background'] as const
export type QueueName = typeof QUEUE_NAMES[number]

export const QUEUE_OF: Record<TaskName, QueueName> = {
  'scan.gmail': 'scans',
  'scan.forms': 'scans',
  'scan.whatsapp': 'scans',
  'calendar.sync': 'background',
  'calendar.renewChannels': 'background',
  'mail.invites': 'mail',
  'mail.invitesAll': 'mail',
  'mail.offers': 'mail',
  'vectors.syncJob': 'background',
  'vectors.removeJob': 'background',
  'vectors.resyncAll': 'background'
}

// Up to 3 attempts, retried after TASK_RETRY_DELAY_MS, then twice that (5 s, 10 s by default).
// Finished tasks are kept a while so the UI and people debugging can still read their result.
const defaultJobOptions = () => ({
  attempts: 3,
  backoff: { type: 'exponential', delay: config.tasks.retryDelayMs },
  removeOnComplete: { age: 7 * 24 * 3600 },
  removeOnFail: { age: 30 * 24 * 3600 }
})

const queues = new Map<QueueName, Queue>()

export const getQueue = (name: QueueName): Queue => {
  let queue = queues.get(name)
  if (!queue) {
    queue = new Queue(name, { connection: redisConnection(), defaultJobOptions: defaultJobOptions() })
    queues.set(name, queue)
  }
  return queue
}

const RUNNING_STATES = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children'])

export interface EnqueueOptions {
  /**
   * A fixed id for "one at a time" tasks (e.g. 'scan.gmail'). Asking again while it's queued or
   * running is a ConflictError (409). Ids can't contain ':' (BullMQ uses it internally).
   */
  taskId?: string
  conflictMessage?: string
}

/** Puts a task on its queue and returns at once. A worker picks it up and runs it. */
export const enqueue = async <K extends TaskName>(name: K, payload: TaskPayloads[K], opts: EnqueueOptions = {}) => {
  const queue = getQueue(QUEUE_OF[name])

  if (opts.taskId) {
    const existing = await queue.getJob(opts.taskId)
    if (existing) {
      if (RUNNING_STATES.has(await existing.getState())) {
        throw new ConflictError(opts.conflictMessage ?? 'This task is already queued or running')
      }
      // A finished run with the same id: BullMQ would silently return it instead of adding a new one
      await existing.remove()
    }
  }

  const job = await queue.add(name, payload, opts.taskId ? { jobId: opts.taskId } : {})
  return { taskId: job.id!, status: 'queued' as const }
}

/**
 * Runs a task every `everyMs` (the first run comes right away). Calling it again with the same
 * schedulerId updates the schedule instead of adding a second one, so every boot can call it.
 */
export const schedule = async <K extends TaskName>(name: K, payload: TaskPayloads[K], opts: { schedulerId: string, everyMs: number }) => {
  await getQueue(QUEUE_OF[name]).upsertJobScheduler(opts.schedulerId, { every: opts.everyMs }, { name, data: payload })
}

/** Finds a task by id in whichever queue holds it. */
export const findTask = async (taskId: string): Promise<Job | null> => {
  for (const name of QUEUE_NAMES) {
    const job = await getQueue(name).getJob(taskId)
    if (job) return job
  }
  return null
}

/** Per queue: how many tasks are in each state, and the most recent ones (newest first). */
export const listRecentTasks = async (perQueue: number) => Promise.all(QUEUE_NAMES.map(async (name) => {
  const queue = getQueue(name)
  const [counts, jobs] = await Promise.all([
    queue.getJobCounts('waiting', 'delayed', 'prioritized', 'active', 'completed', 'failed'),
    queue.getJobs(['waiting', 'delayed', 'prioritized', 'active', 'completed', 'failed'], 0, perQueue - 1, false)
  ])
  return {
    queue: name,
    counts: {
      queued: (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0),
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0
    },
    jobs: jobs.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp).slice(0, perQueue)
  }
}))

export const isTaskRunning = async (taskId: string): Promise<boolean> => {
  const job = await findTask(taskId)
  return job ? RUNNING_STATES.has(await job.getState()) : false
}

export const closeQueues = async () => {
  await Promise.all([...queues.values()].map(q => q.close()))
  queues.clear()
}

/** Throws if Redis can't be reached (used by the health check). */
export const pingRedis = async (): Promise<void> => {
  // a cheap read that needs a live Redis connection
  await getQueue('background').getJobCounts('active')
}

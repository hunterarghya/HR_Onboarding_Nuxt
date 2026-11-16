import { UnrecoverableError, Worker } from 'bullmq'
import { logger } from '../logger'
import { redisConnection } from './connection'
import { QUEUE_NAMES, type QueueName, type TaskName, type TaskPayloads } from './queues'
import type { TaskProgress } from './task-status'

/**
 * A processor is a plain function: payload in, result out. It never sees BullMQ, so it is
 * unit-tested with fake services, and the same feature service could run without a queue.
 */
export interface TaskContext {
  reportProgress: (progress: TaskProgress) => Promise<void>
  /** 1 on the first run, 2+ on retries */
  attempt: number
}
export type TaskProcessor<K extends TaskName> = (payload: TaskPayloads[K], ctx: TaskContext) => Promise<unknown>
export type TaskProcessors = { [K in TaskName]?: TaskProcessor<K> }

// How many tasks of each queue one process runs at the same time
const CONCURRENCY: Record<QueueName, number> = { scans: 1, mail: 1, background: 2 }

const log = logger.withTag('tasks')

/**
 * If anything in the error's cause chain says retrying can't help (an API key the provider refused),
 * the task fails at once with that error's advice instead of being retried.
 */
const finalReason = (err: unknown): string | null => {
  for (let e = err as { needsNewKey?: unknown, kind?: unknown, advice?: unknown, cause?: unknown } | undefined, depth = 0; e && depth < 5; e = e.cause as typeof e, depth++) {
    if (e.needsNewKey === true && e.kind === 'auth' && typeof e.advice === 'string') return e.advice
  }
  return null
}
const workers: Worker[] = []

/** Starts one worker per queue. Each job is routed to the processor registered for its name. */
export const startWorkers = (processors: TaskProcessors) => {
  for (const queueName of QUEUE_NAMES) {
    const worker = new Worker(queueName, async (job) => {
      const processor = processors[job.name as TaskName] as TaskProcessor<TaskName> | undefined
      if (!processor) throw new Error(`No processor registered for task "${job.name}"`)
      try {
        return await processor(job.data, {
          reportProgress: progress => job.updateProgress(progress),
          attempt: job.attemptsMade + 1
        })
      } catch (err) {
        const final = finalReason(err)
        throw final ? new UnrecoverableError(final) : err
      }
    }, { connection: redisConnection(), concurrency: CONCURRENCY[queueName] })

    worker.on('active', job => log.info(`${job.name} (${job.id}) started`))
    worker.on('completed', job => log.info(`${job.name} (${job.id}) completed`))
    worker.on('failed', (job, err) => log.error(`${job?.name} (${job?.id}) failed on attempt ${job?.attemptsMade}:`, err.message))
    worker.on('error', err => log.error(`worker error on queue ${queueName}:`, err.message))
    workers.push(worker)
  }
  log.info(`Workers started for queues: ${QUEUE_NAMES.join(', ')}`)
}

/** Lets running jobs finish, then disconnects. Unfinished jobs are picked up again on the next start. */
export const stopWorkers = async () => {
  await Promise.all(workers.map(w => w.close()))
  workers.length = 0
}

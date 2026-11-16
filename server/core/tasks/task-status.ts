import type { Job } from 'bullmq'

/** What the UI polls: GET /api/tasks/:id. */
export interface TaskStatus {
  id: string
  name: string
  state: 'queued' | 'active' | 'completed' | 'failed'
  progress: TaskProgress | null
  result: unknown
  error: string | null
  attempts: number
  createdAt: string
  /** When a worker first picked it up (null while waiting) */
  startedAt: string | null
  /** For a task waiting on a timer (a retry delay, a daily schedule): when it will run */
  scheduledFor: string | null
  finishedAt: string | null
}

/** Reported by processors while they run, e.g. { done: 12, total: 40, stage: 'processing resumes' } */
export interface TaskProgress {
  done: number
  total: number
  stage?: string
}

/** BullMQ's own state, before it is folded into the four the UI knows */
const isDelayed = (bullState: string) => bullState === 'delayed'

const toState = (bullState: string): TaskStatus['state'] => {
  if (bullState === 'active') return 'active'
  if (bullState === 'completed') return 'completed'
  if (bullState === 'failed') return 'failed'
  return 'queued' // waiting, delayed (between retries), prioritized, waiting-children
}

/** `refetch` reloads the same job; used when it finished between being fetched and inspected. */
export const toTaskStatus = async (fetched: Job, refetch: () => Promise<Job | null>): Promise<TaskStatus> => {
  const bullState = await fetched.getState()
  const state = toState(bullState)
  // The job may have finished between being fetched and asked for its state: re-read it so the
  // result / error match the state
  const job = state === 'completed' || state === 'failed'
    ? (await refetch()) ?? fetched
    : fetched
  const progress = typeof job.progress === 'object' && job.progress !== null ? job.progress as TaskProgress : null
  return {
    id: job.id!,
    name: job.name,
    state,
    progress,
    result: state === 'completed' ? job.returnvalue : null,
    error: state === 'failed' ? (job.failedReason || 'Task failed') : null,
    attempts: job.attemptsMade,
    createdAt: new Date(job.timestamp).toISOString(),
    startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    scheduledFor: isDelayed(bullState) ? new Date(job.timestamp + (job.opts.delay ?? 0)).toISOString() : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null
  }
}

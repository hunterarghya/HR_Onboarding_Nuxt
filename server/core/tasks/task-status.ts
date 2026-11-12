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
  finishedAt: string | null
}

/** Reported by processors while they run, e.g. { done: 12, total: 40, stage: 'processing resumes' } */
export interface TaskProgress {
  done: number
  total: number
  stage?: string
}

const toState = (bullState: string): TaskStatus['state'] => {
  if (bullState === 'active') return 'active'
  if (bullState === 'completed') return 'completed'
  if (bullState === 'failed') return 'failed'
  return 'queued' // waiting, delayed (between retries), prioritized, waiting-children
}

export const toTaskStatus = async (job: Job): Promise<TaskStatus> => {
  const state = toState(await job.getState())
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
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null
  }
}

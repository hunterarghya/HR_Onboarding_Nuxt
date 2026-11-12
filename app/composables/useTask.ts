export interface TaskProgress {
  done: number
  total: number
  stage?: string
}

interface TaskStatus {
  id: string
  state: 'queued' | 'active' | 'completed' | 'failed'
  progress: TaskProgress | null
  result: unknown
  error: string | null
}

interface RunTaskOptions {
  /** Called whenever the worker reports progress */
  onProgress?: (progress: TaskProgress) => void
  /**
   * The task's fixed id (e.g. 'scan.gmail'). If the server answers 409 because that task is already
   * running, we follow the running one instead of showing an error.
   */
  taskIdOnConflict?: string
}

const POLL_INTERVAL_MS = 2000

/**
 * Long operations (scans, calendar sync, bulk mail) run as background tasks: the POST answers
 * 202 { taskId } at once, and this polls GET /api/tasks/:id until the task finishes.
 */
export const useTask = () => {
  const { apiFetch } = useApi()

  /** Resolves with the task's result, or rejects with its error message. */
  const waitForTask = async <R>(taskId: string, onProgress?: (p: TaskProgress) => void): Promise<R> => {
    for (;;) {
      const status = await apiFetch<TaskStatus>(`/tasks/${encodeURIComponent(taskId)}`)
      if (status.progress) onProgress?.(status.progress)
      if (status.state === 'completed') return status.result as R
      if (status.state === 'failed') throw new Error(status.error || 'The task failed')
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }

  /** Starts a task with `start` (the POST that answers 202) and waits for its result. */
  const runTask = async <R>(start: () => Promise<{ taskId: string }>, opts: RunTaskOptions = {}): Promise<R> => {
    let taskId: string
    try {
      taskId = (await start()).taskId
    } catch (err) {
      const status = (err as { status?: number, statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode
      if (status !== 409 || !opts.taskIdOnConflict) throw err
      taskId = opts.taskIdOnConflict
    }
    return waitForTask<R>(taskId, opts.onProgress)
  }

  return { runTask, waitForTask }
}

/** "3 / 10" style text for a progress readout, or '' before anything is known. */
export const formatTaskProgress = (progress: TaskProgress | null) =>
  progress && progress.total > 0 ? `${progress.done} / ${progress.total}` : ''

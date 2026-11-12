import { pingDatabase } from '~~/server/core/db/pool'
import { pingRedis } from '~~/server/core/tasks/queues'
import { getLlm } from '~~/server/integrations/llm'
import { pingQdrant } from '~~/server/integrations/qdrant/qdrant.client'

const CHECK_TIMEOUT_MS = 3000

type CheckResult = 'ok' | 'error'

const check = async (probe: () => Promise<void>): Promise<CheckResult> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), CHECK_TIMEOUT_MS)
  })
  try {
    await Promise.race([probe(), timeout])
    return 'ok'
  } catch {
    return 'error'
  } finally {
    clearTimeout(timer)
  }
}

export const healthService = {
  /**
   * The database is required: without it the status is 'down' (HTTP 503). The task queue (Redis),
   * Qdrant and the LLM are reported but optional: pages still work, only background tasks, resume
   * matching or the AI helpers stop.
   * Results carry no error details, since this route is public.
   */
  async check() {
    const llm = getLlm()
    const [database, queue, vectorStore, llmStatus] = await Promise.all([
      check(pingDatabase),
      check(pingRedis),
      check(pingQdrant),
      check(() => llm.ping(CHECK_TIMEOUT_MS))
    ])
    return {
      status: database === 'ok' ? 'ok' as const : 'down' as const,
      checks: { database, queue, vectorStore, llm: llmStatus, llmProvider: llm.name }
    }
  }
}

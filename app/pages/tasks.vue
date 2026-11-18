<script setup lang="ts">
// Background tasks (scans, calendar sync, mail, indexing) as BullMQ sees them, refreshed every few seconds.

interface TaskStatus {
  id: string
  name: string
  /** Plain-words name ("Sync Google Calendar"); `name` is the internal one */
  title: string
  /** A finished task's result in one sentence */
  summary: string
  state: 'queued' | 'active' | 'completed' | 'failed'
  progress: { done: number, total: number, stage?: string } | null
  result: unknown
  error: string | null
  attempts: number
  createdAt: string
  startedAt: string | null
  scheduledFor: string | null
  finishedAt: string | null
}
interface QueueSummary {
  queue: string
  title: string
  counts: { queued: number, scheduled: number, active: number, completed: number, failed: number }
  tasks: TaskStatus[]
}

const { apiFetch } = useApi()
const queues = ref<QueueSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const load = async () => {
  loading.value = true
  try {
    queues.value = await apiFetch<QueueSummary[]>('/tasks', { params: { limit: 25 } })
    error.value = null
  } catch (err) {
    error.value = (err as Error).message || 'Could not load tasks'
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  load()
  timer = setInterval(load, 5000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

/** "scheduled" for a task waiting on a timer (a daily job, a retry), else the API's state */
const stateKey = (t: TaskStatus) => (t.state === 'queued' && t.scheduledFor ? 'scheduled' : t.state)

const STATE_BADGES = {
  queued: { label: 'waiting', color: 'neutral' },
  scheduled: { label: 'scheduled', color: 'neutral' },
  active: { label: 'running', color: 'info' },
  completed: { label: 'done', color: 'success' },
  failed: { label: 'failed', color: 'error' }
} as const

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

const outcome = (t: TaskStatus) => {
  if (t.state === 'failed') return t.error
  if (t.state === 'active') return t.progress ? `${t.progress.stage ?? 'Working'}: ${t.progress.done} / ${t.progress.total}` : 'Working…'
  if (t.state === 'completed') return t.summary
  if (t.scheduledFor) return `Runs ${when(t.scheduledFor)}`
  return 'Waiting to start'
}
</script>

<template>
  <UDashboardPanel id="tasks">
    <template #header>
      <UDashboardNavbar title="Background tasks">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            @click="load"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
        />

        <UCard v-for="q in queues" :key="q.queue">
          <template #header>
            <div class="flex items-center justify-between flex-wrap gap-2">
              <p class="font-semibold">
                {{ q.title }}
              </p>
              <div class="flex flex-wrap gap-2 text-sm whitespace-nowrap">
                <UBadge color="neutral" variant="subtle">
                  {{ q.counts.queued }} waiting
                </UBadge>
                <UBadge v-if="q.counts.scheduled" color="neutral" variant="outline">
                  {{ q.counts.scheduled }} scheduled
                </UBadge>
                <UBadge color="info" variant="subtle">
                  {{ q.counts.active }} running
                </UBadge>
                <UBadge color="success" variant="subtle">
                  {{ q.counts.completed }} done
                </UBadge>
                <UBadge color="error" variant="subtle">
                  {{ q.counts.failed }} failed
                </UBadge>
              </div>
            </div>
          </template>

          <p v-if="q.tasks.length === 0" class="text-sm text-muted">
            No tasks yet.
          </p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted">
                  <th class="py-2 pr-3">
                    Task
                  </th>
                  <th class="py-2 pr-3">
                    State
                  </th>
                  <th class="py-2 pr-3">
                    Outcome
                  </th>
                  <th class="py-2 pr-3">
                    Tries
                  </th>
                  <th class="py-2 pr-3">
                    Started
                  </th>
                  <th class="py-2">
                    Finished
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in q.tasks" :key="t.id" class="border-t border-default align-top">
                  <td class="py-2 pr-3">
                    <p class="font-medium">
                      {{ t.title }}
                    </p>
                  </td>
                  <td class="py-2 pr-3">
                    <UBadge :color="STATE_BADGES[stateKey(t)].color" variant="subtle">
                      {{ STATE_BADGES[stateKey(t)].label }}
                    </UBadge>
                  </td>
                  <td class="py-2 pr-3 max-w-md break-words">
                    {{ outcome(t) }}
                  </td>
                  <td class="py-2 pr-3">
                    {{ t.attempts }}
                  </td>
                  <td class="py-2 pr-3 whitespace-nowrap">
                    {{ when(t.startedAt) }}
                  </td>
                  <td class="py-2 whitespace-nowrap">
                    {{ when(t.finishedAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

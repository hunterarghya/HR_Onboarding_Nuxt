<script setup lang="ts">
// Background tasks (scans, calendar sync, mail, indexing) as BullMQ sees them, refreshed every few seconds.

interface TaskStatus {
  id: string
  name: string
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

/** "scheduled" for a task waiting on a timer (a daily job, a retry), else BullMQ's state as the API gives it */
const stateLabel = (t: TaskStatus) => (t.state === 'queued' && t.scheduledFor ? 'scheduled' : t.state)

const stateColor = (t: TaskStatus) =>
  ({ queued: 'neutral', scheduled: 'neutral', active: 'info', completed: 'success', failed: 'error' } as const)[stateLabel(t)]

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

const outcome = (t: TaskStatus) => {
  if (t.state === 'failed') return t.error
  if (t.state === 'active' && t.progress) return `${t.progress.stage ?? 'working'}: ${t.progress.done} / ${t.progress.total}`
  if (t.state === 'completed' && t.result && typeof t.result === 'object') {
    const r = t.result as Record<string, unknown>
    if (typeof r.message === 'string') return `${r.message}${typeof r.count === 'number' ? ` (${r.count})` : ''}`
    // e.g. { renewed: 0, failed: 0 } → "renewed 0 · failed 0"
    return Object.entries(r).map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
  }
  if (t.scheduledFor) return `runs ${when(t.scheduledFor)}`
  return ''
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
              <p class="font-semibold capitalize">
                {{ q.queue }}
              </p>
              <div class="flex gap-2 text-sm">
                <UBadge color="neutral" variant="subtle">
                  {{ q.counts.queued }} queued
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
                      {{ t.name }}
                    </p>
                    <p v-if="t.id !== t.name" class="text-xs text-muted">
                      {{ t.id }}
                    </p>
                  </td>
                  <td class="py-2 pr-3">
                    <UBadge :color="stateColor(t)" variant="subtle">
                      {{ stateLabel(t) }}
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

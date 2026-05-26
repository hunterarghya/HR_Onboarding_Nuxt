<script setup lang="ts">
import { addMonths, subMonths, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, parseISO, isBefore, isAfter, startOfDay } from 'date-fns'
import type { InterviewEvent, Job, Candidate, UnsentCount, EmailTemplate, PaginatedResponse } from '~/types'

const { apiFetch, token } = useApi()
const toast = useToast()

// Calendar sync state
const syncingCalendar = ref(false)
const lastSyncTime = ref<string | null>(null)

const jobs = ref<Job[]>([])
const events = ref<InterviewEvent[]>([])
const unsentCounts = ref<Record<number, number>>({})
const templates = ref<EmailTemplate[]>([])

// Calendar state
const currentDate = ref(new Date())
const selectedDate = ref(new Date())

// Event creation form
const createForm = reactive({
  role: '',
  event_date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '10:00',
  end_time: '11:00',
  num_candidates: 5,
  extra_candidates: 0,
  interview_mode: 'offline' as 'offline' | 'online',
  venue_or_link: ''
})

// Expanded event state (single expanded event like React ref)
const expandedEvent = ref<number | null>(null)
const eventCandidates = ref<Record<number, any[]>>({})

// Selection state (matches React InterviewScheduler)
const selectionMode = ref<'manual' | 'auto' | null>(null)
const editingEventId = ref<number | null>(null)
const eligibleCandidates = ref<any[]>([])
const selectedCandidateIds = ref<Set<number>>(new Set())
const loadingCandidates = ref(false)

// Selection details modal (for "selected" status)
const selectionModal = reactive({
  isOpen: false,
  candidateId: null as number | null,
  candidateName: '',
  eventId: null as number | null,
  form: { offered_role: '', offered_salary: '', offered_location: '', joining_date: '' }
})

// Modals
const mailOpen = ref(false)
const mailModal = reactive({ eventId: null as number | null, templateId: '', sending: false })

// Fetch data
const fetchJobs = async () => {
  try {
    jobs.value = await apiFetch<Job[]>('/jobs')
  } catch (err) {
    console.error('Error fetching jobs:', err)
  }
}

const fetchEvents = async () => {
  try {
    events.value = await apiFetch<InterviewEvent[]>('/interviews/events')
    
    // Fetch unsent counts
    try {
      const res = await apiFetch<UnsentCount[]>('/mail/unsent-invites-count')
      const counts: Record<number, number> = {}
      res.forEach(r => { counts[r.event_id] = r.unsent_count })
      unsentCounts.value = counts
    } catch (e) { /* ignore if endpoint not available */ }
  } catch (err) {
    console.error('Error fetching events:', err)
  }
}

const fetchTemplates = async () => {
  try {
    templates.value = await apiFetch<EmailTemplate[]>('/templates')
  } catch (err) {
    console.error('Error fetching templates:', err)
  }
}

const handleCreateEvent = async () => {
  if (!createForm.role || !createForm.event_date || !createForm.venue_or_link) {
    toast.add({ title: 'Please fill all required fields', color: 'warning' })
    return
  }
  try {
    await apiFetch('/interviews/events', {
      method: 'POST',
      body: { ...createForm, sync_calendar: true }
    })
    toast.add({ title: 'Interview event created', color: 'success' })
    createForm.venue_or_link = ''
    fetchEvents()
  } catch (err) {
    console.error('Error creating event:', err)
    toast.add({ title: 'Failed to create event', color: 'error' })
  }
}

// Google Calendar Sync
const handleSyncCalendar = async () => {
  syncingCalendar.value = true
  try {
    const res = await apiFetch<{ message: string, imported: number }>('/interviews/sync-calendar', {
      method: 'POST'
    })
    lastSyncTime.value = new Date().toLocaleTimeString()
    toast.add({
      title: 'Google Calendar Synced',
      description: `${res.imported} new event(s) imported`,
      color: 'success'
    })
    await fetchEvents()
  } catch (err: any) {
    console.error('Calendar sync error:', err)
    toast.add({
      title: 'Calendar Sync Failed',
      description: err.data?.details || err.data?.statusMessage || err.message || 'Could not sync with Google Calendar',
      color: 'error'
    })
  } finally {
    syncingCalendar.value = false
  }
}

const handleDeleteEvent = async (id: number) => {
  if (!confirm('Delete this interview event?')) return
  try {
    await apiFetch(`/interviews/events/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Event deleted', color: 'success' })
    if (expandedEvent.value === id) {
      expandedEvent.value = null
      selectionMode.value = null
      editingEventId.value = null
    }
    fetchEvents()
  } catch (err) {
    console.error('Error deleting event:', err)
    toast.add({ title: 'Failed to delete event', color: 'error' })
  }
}

// Toggle expand (single event at a time, like React)
const toggleEventExpand = async (eventId: number) => {
  if (expandedEvent.value === eventId) {
    expandedEvent.value = null
    selectionMode.value = null
    editingEventId.value = null
    return
  }
  expandedEvent.value = eventId
  selectionMode.value = null
  editingEventId.value = null
  await fetchAssignedCandidates(eventId)
}

const fetchAssignedCandidates = async (eventId: number) => {
  try {
    const data = await apiFetch<any[]>(`/interviews/events/${eventId}/candidates`)
    eventCandidates.value[eventId] = data
  } catch (err) {
    console.error('Error fetching assigned:', err)
  }
}

// Fetch eligible candidates for manual selection (uses dedicated endpoint)
const fetchEligible = async (eventId: number) => {
  try {
    const data = await apiFetch<any[]>(`/interviews/eligible-candidates/${eventId}`)
    eligibleCandidates.value = data
  } catch (err) {
    console.error('Error fetching eligible:', err)
  }
}

// Auto-assign top N candidates by score
const handleAutoAssign = async (eventId: number) => {
  selectionMode.value = 'auto'
  try {
    await apiFetch(`/interviews/events/${eventId}/candidates/auto`, { method: 'POST' })
    await fetchAssignedCandidates(eventId)
    await fetchEvents()
    toast.add({ title: 'Auto-assign complete', color: 'success' })
  } catch (err: any) {
    console.error('Error auto-assigning:', err)
    toast.add({ title: 'Auto-assign failed', color: 'error' })
  }
}

// Start manual candidate selection
const startManualSelection = async (eventId: number) => {
  selectionMode.value = 'manual'
  editingEventId.value = null
  loadingCandidates.value = true
  await fetchEligible(eventId)
  // Pre-check already assigned
  const assigned = eventCandidates.value[eventId] || []
  selectedCandidateIds.value = new Set(assigned.map((c: any) => c.id))
  loadingCandidates.value = false
}

// Start editing existing selection
const startEditSelection = async (eventId: number) => {
  editingEventId.value = eventId
  selectionMode.value = 'manual'
  loadingCandidates.value = true
  await fetchEligible(eventId)
  const assigned = eventCandidates.value[eventId] || []
  selectedCandidateIds.value = new Set(assigned.map((c: any) => c.id))
  loadingCandidates.value = false
}

// Toggle a candidate in the selection set
const toggleCandidateSelect = (id: number) => {
  const next = new Set(selectedCandidateIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedCandidateIds.value = next
}

// Toggle select all
const toggleSelectAll = () => {
  if (selectedCandidateIds.value.size === eligibleCandidates.value.length) {
    selectedCandidateIds.value = new Set()
  } else {
    selectedCandidateIds.value = new Set(eligibleCandidates.value.map((c: any) => c.id))
  }
}

// Save manual selection (POST for new, PATCH for edit)
const saveManualSelection = async (eventId: number) => {
  const ids = Array.from(selectedCandidateIds.value)
  try {
    const method = editingEventId.value ? 'PATCH' : 'POST'
    await apiFetch(`/interviews/events/${eventId}/candidates/manual`, {
      method,
      body: { candidate_ids: ids }
    })
    await fetchAssignedCandidates(eventId)
    await fetchEvents()
    selectionMode.value = null
    editingEventId.value = null
    toast.add({ title: editingEventId.value ? 'Selection updated' : 'Candidates assigned', color: 'success' })
  } catch (err) {
    console.error('Error saving selection:', err)
    toast.add({ title: 'Failed to save candidates', color: 'error' })
  }
}

// Handle status change for a candidate
const handleStatusChange = async (candidateId: number, newStatus: string, eventId: number) => {
  if (newStatus === 'marked') {
    // Open selection details modal
    let candidate = eligibleCandidates.value.find((c: any) => c.id === candidateId)
    if (!candidate) {
      const assigned = eventCandidates.value[eventId] || []
      candidate = assigned.find((c: any) => c.id === candidateId)
    }
    selectionModal.isOpen = true
    selectionModal.candidateId = candidateId
    selectionModal.candidateName = candidate?.name || ''
    selectionModal.eventId = eventId
    selectionModal.form = {
      offered_role: candidate?.role_applied || '',
      offered_salary: '',
      offered_location: candidate?.current_location || '',
      joining_date: ''
    }
    return
  }

  try {
    await apiFetch(`/candidates/${candidateId}/status`, {
      method: 'PATCH',
      body: { status: newStatus }
    })
    if (eventId) await fetchAssignedCandidates(eventId)
    if (selectionMode.value === 'manual') await fetchEligible(eventId)
    toast.add({ title: 'Status updated', color: 'success' })
  } catch (err) {
    console.error('Error updating status:', err)
    toast.add({ title: 'Status update failed', color: 'error' })
  }
}

// Submit the selection details modal
const submitSelection = async () => {
  const { offered_role, offered_salary, offered_location, joining_date } = selectionModal.form
  if (!offered_role || !offered_salary || !offered_location || !joining_date) {
    toast.add({ title: 'All fields are required to mark as Selected', color: 'warning' })
    return
  }
  try {
    await apiFetch(`/candidates/${selectionModal.candidateId}/status`, {
      method: 'PATCH',
      body: { status: 'selected', ...selectionModal.form }
    })
    const eid = selectionModal.eventId
    selectionModal.isOpen = false
    selectionModal.candidateId = null
    selectionModal.candidateName = ''
    selectionModal.eventId = null
    selectionModal.form = { offered_role: '', offered_salary: '', offered_location: '', joining_date: '' }
    if (eid) {
      await fetchAssignedCandidates(eid)
      if (selectionMode.value === 'manual') await fetchEligible(eid)
    }
    toast.add({ title: 'Candidate selected!', color: 'success' })
  } catch (err) {
    console.error('Error submitting selection:', err)
    toast.add({ title: 'Failed to save selection', color: 'error' })
  }
}

const openMailModal = (eventId: number | null = null) => {
  mailModal.eventId = eventId
  const inviteTemplate = templates.value.find(t => t.type === 'invite')
  mailModal.templateId = inviteTemplate ? String(inviteTemplate.id) : (templates.value[0] ? String(templates.value[0].id) : '')
  mailModal.sending = false
  mailOpen.value = true
}

const sendInvites = async () => {
  if (!mailModal.templateId) return
  mailModal.sending = true
  try {
    const url = mailModal.eventId
      ? `/mail/interview-invites/${mailModal.eventId}`
      : '/mail/interview-invites-all'
    const res = await apiFetch<{ sent: number, failed: number, skipped: number }>(url, {
      method: 'POST',
      body: { templateId: mailModal.templateId }
    })
    toast.add({ title: 'Invites Sent', description: `Sent: ${res.sent}, Failed: ${res.failed}, Skipped: ${res.skipped}`, color: 'success' })
    mailOpen.value = false
    fetchEvents()
    if (mailModal.eventId) fetchAssignedCandidates(mailModal.eventId)
  } catch (err: any) {
    console.error('Mail error:', err)
    toast.add({ title: 'Failed to send invites', description: err.data?.details || err.message, color: 'error' })
  } finally {
    mailModal.sending = false
  }
}

// Calendar Logic
const daysInMonth = computed(() => {
  const start = startOfMonth(currentDate.value)
  const end = endOfMonth(currentDate.value)
  return eachDayOfInterval({ start, end })
})

const firstDayOffset = computed(() => {
  const start = startOfMonth(currentDate.value)
  return start.getDay() // 0 = Sunday, 1 = Monday...
})

const nextMonth = () => { currentDate.value = addMonths(currentDate.value, 1) }
const prevMonth = () => { currentDate.value = subMonths(currentDate.value, 1) }

const getEventsForDay = (date: Date) => {
  const dStr = format(date, 'yyyy-MM-dd')
  return events.value.filter(e => e.event_date.startsWith(dStr))
}

const hasEventsOnDay = (date: Date) => {
  return getEventsForDay(date).length > 0
}

const selectDate = (date: Date) => {
  selectedDate.value = date
  createForm.event_date = format(date, 'yyyy-MM-dd')
}

const filteredEvents = computed(() => {
  const dStr = format(selectedDate.value, 'yyyy-MM-dd')
  return events.value.filter(e => e.event_date.startsWith(dStr))
})

// All upcoming events (sorted by date then time)
const allUpcomingEvents = computed(() => {
  const today = format(new Date(), 'yyyy-MM-dd')
  return events.value
    .filter(e => e.event_date >= today)
    .sort((a, b) => {
      if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date)
      return a.start_time.localeCompare(b.start_time)
    })
    .slice(0, 20)
})

// Past events
const pastEvents = computed(() => {
  const today = format(new Date(), 'yyyy-MM-dd')
  return events.value
    .filter(e => e.event_date < today)
    .sort((a, b) => {
      if (a.event_date !== b.event_date) return b.event_date.localeCompare(a.event_date)
      return b.start_time.localeCompare(a.start_time)
    })
    .slice(0, 10)
})

// Calendar day class logic
const getDayClasses = (day: Date) => {
  const selected = isSameDay(day, selectedDate.value)
  const today = isToday(day)
  const hasEvents = hasEventsOnDay(day)

  return {
    // Selected date: solid primary
    'bg-[var(--ui-color-primary)] text-white font-bold shadow-lg shadow-primary/30 hover:bg-[var(--ui-color-primary)]': selected && !today,
    // Today (not selected): emerald ring with subtle bg
    'ring-2 ring-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold': today && !selected,
    // Both today AND selected: emerald ring + primary bg
    'bg-[var(--ui-color-primary)] text-white font-bold ring-2 ring-emerald-400 shadow-lg shadow-primary/30 hover:bg-[var(--ui-color-primary)]': today && selected,
    // Has events (not selected, not today): subtle highlight
    'bg-[var(--ui-color-primary)]/10 text-[var(--ui-color-primary)] font-medium': hasEvents && !selected && !today,
    // Normal day
    'text-foreground hover:bg-elevated/50': !selected && !today && !hasEvents
  }
}

onMounted(() => {
  fetchJobs()
  fetchEvents()
  fetchTemplates()
})
</script>

<template>
  <UDashboardPanel id="interviews">
    <template #header>
      <UDashboardNavbar title="Interview Scheduler">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-3">
            <span v-if="lastSyncTime" class="text-xs text-muted hidden sm:inline">
              Last synced: {{ lastSyncTime }}
            </span>
            <UButton
              id="sync-google-calendar-btn"
              icon="i-lucide-refresh-cw"
              color="primary"
              variant="solid"
              :loading="syncingCalendar"
              :disabled="syncingCalendar"
              @click="handleSyncCalendar"
            >
              <template #leading>
                <svg v-if="!syncingCalendar" class="size-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 12C22 6.477 17.523 2 12 2S2 6.477 2 12s4.477 10 10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                  <path d="M8 12h8m-4-4v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </template>
              {{ syncingCalendar ? 'Syncing...' : 'Sync Google Calendar' }}
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col xl:flex-row gap-6">
        
        <!-- Left Column: Calendar -->
        <div class="w-full xl:w-[400px] shrink-0">
          <UCard class="sticky top-4">
            <!-- Calendar Header -->
            <div class="flex items-center justify-between mb-4">
              <h2 class="font-bold text-lg">{{ format(currentDate, 'MMMM yyyy') }}</h2>
              <div class="flex gap-1">
                <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="sm" @click="prevMonth" />
                <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" @click="nextMonth" />
              </div>
            </div>

            <!-- Calendar Grid -->
            <div class="grid grid-cols-7 gap-1 text-center mb-2">
              <div v-for="day in ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']" :key="day" class="text-xs font-semibold text-muted py-1">
                {{ day }}
              </div>
            </div>
            <div class="grid grid-cols-7 gap-1">
              <!-- Empty slots for offset -->
              <div v-for="i in firstDayOffset" :key="`empty-${i}`" class="p-2"></div>
              
              <!-- Days -->
              <button
                v-for="day in daysInMonth"
                :key="day.toString()"
                class="relative p-2 rounded-lg flex flex-col items-center justify-center min-h-[44px] transition-all duration-200"
                :class="getDayClasses(day)"
                @click="selectDate(day)"
              >
                <span class="text-sm z-10">{{ format(day, 'd') }}</span>
                <!-- Today label -->
                <span v-if="isToday(day) && !isSameDay(day, selectedDate)" class="absolute -top-0.5 right-0.5 size-1.5 rounded-full bg-emerald-500"></span>
                <!-- Event indicators -->
                <div v-if="getEventsForDay(day).length > 0" class="absolute bottom-1 flex gap-0.5 z-10">
                  <div
                    v-for="(e, idx) in Math.min(getEventsForDay(day).length, 3)"
                    :key="idx"
                    class="size-1.5 rounded-full transition-colors"
                    :class="isSameDay(day, selectedDate) ? 'bg-white' : isToday(day) ? 'bg-emerald-400' : 'bg-[var(--ui-color-primary)]'"
                  ></div>
                </div>
              </button>
            </div>

            <!-- Calendar Legend -->
            <div class="mt-4 pt-3 border-t border-default flex items-center gap-4 text-xs text-muted">
              <div class="flex items-center gap-1.5">
                <span class="size-3 rounded ring-2 ring-emerald-500 bg-emerald-500/10"></span>
                <span>Today</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="size-3 rounded bg-[var(--ui-color-primary)]"></span>
                <span>Selected</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="size-3 rounded bg-[var(--ui-color-primary)]/10"></span>
                <span>Has Events</span>
              </div>
            </div>
          </UCard>

          <!-- Synced Events List Below Calendar -->
          <div class="mt-4 space-y-3">
            <!-- Upcoming Events -->
            <UCard v-if="allUpcomingEvents.length > 0">
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-calendar-clock" class="size-4 text-emerald-500" />
                    <span class="font-semibold text-sm">Upcoming Events</span>
                  </div>
                  <UBadge size="xs" variant="subtle" color="success">{{ allUpcomingEvents.length }}</UBadge>
                </div>
              </template>
              <div class="space-y-1 max-h-[340px] overflow-y-auto pr-1 -mr-1">
                <button
                  v-for="ev in allUpcomingEvents"
                  :key="ev.id"
                  class="w-full flex items-start gap-3 p-2.5 rounded-lg transition-all duration-200 text-left group"
                  :class="{
                    'bg-[var(--ui-color-primary)]/10 ring-1 ring-[var(--ui-color-primary)]/30': ev.event_date === format(selectedDate, 'yyyy-MM-dd'),
                    'hover:bg-elevated/50': ev.event_date !== format(selectedDate, 'yyyy-MM-dd')
                  }"
                  @click="selectDate(new Date(ev.event_date + 'T00:00:00'))"
                >
                  <!-- Date badge -->
                  <div class="shrink-0 w-11 text-center">
                    <div class="text-[10px] uppercase font-semibold text-muted leading-tight">
                      {{ format(new Date(ev.event_date + 'T00:00:00'), 'MMM') }}
                    </div>
                    <div class="text-lg font-bold leading-tight"
                      :class="ev.event_date === format(new Date(), 'yyyy-MM-dd') ? 'text-emerald-500' : 'text-foreground'"
                    >
                      {{ format(new Date(ev.event_date + 'T00:00:00'), 'd') }}
                    </div>
                  </div>
                  <!-- Event info -->
                  <div class="min-w-0 flex-1">
                    <div class="font-semibold text-sm truncate leading-tight">{{ ev.role }}</div>
                    <div class="flex items-center gap-2 mt-0.5 text-xs text-muted">
                      <span class="flex items-center gap-0.5">
                        <UIcon name="i-lucide-clock" class="size-3" />
                        {{ ev.start_time.substring(0, 5) }} - {{ ev.end_time.substring(0, 5) }}
                      </span>
                      <UBadge size="xs" :color="ev.interview_mode === 'online' ? 'info' : 'neutral'" variant="subtle">
                        <UIcon :name="ev.interview_mode === 'online' ? 'i-lucide-video' : 'i-lucide-map-pin'" class="size-2.5 mr-0.5" />
                        {{ ev.interview_mode }}
                      </UBadge>
                    </div>
                    <div v-if="ev.google_event_id" class="mt-0.5">
                      <UBadge size="xs" variant="subtle" color="success">
                        <UIcon name="i-lucide-check-circle" class="size-2.5 mr-0.5" /> Google Synced
                      </UBadge>
                    </div>
                  </div>
                </button>
              </div>
            </UCard>

            <!-- Past Events -->
            <UCard v-if="pastEvents.length > 0">
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-history" class="size-4 text-muted" />
                    <span class="font-semibold text-sm text-muted">Past Events</span>
                  </div>
                  <UBadge size="xs" variant="subtle" color="neutral">{{ pastEvents.length }}</UBadge>
                </div>
              </template>
              <div class="space-y-1 max-h-[200px] overflow-y-auto pr-1 -mr-1 opacity-70">
                <button
                  v-for="ev in pastEvents"
                  :key="ev.id"
                  class="w-full flex items-start gap-3 p-2 rounded-lg hover:bg-elevated/50 transition-all text-left"
                  @click="selectDate(new Date(ev.event_date + 'T00:00:00'))"
                >
                  <div class="shrink-0 w-11 text-center">
                    <div class="text-[10px] uppercase font-semibold text-muted leading-tight">
                      {{ format(new Date(ev.event_date + 'T00:00:00'), 'MMM') }}
                    </div>
                    <div class="text-lg font-bold leading-tight text-muted">
                      {{ format(new Date(ev.event_date + 'T00:00:00'), 'd') }}
                    </div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="font-medium text-sm truncate text-muted">{{ ev.role }}</div>
                    <div class="text-xs text-muted/70">
                      {{ ev.start_time.substring(0, 5) }} - {{ ev.end_time.substring(0, 5) }}
                    </div>
                  </div>
                </button>
              </div>
            </UCard>

            <!-- Empty state -->
            <div v-if="allUpcomingEvents.length === 0 && pastEvents.length === 0" class="text-center text-sm text-muted py-6 border border-dashed border-default rounded-xl">
              <UIcon name="i-lucide-calendar-x" class="size-8 text-muted/50 mx-auto mb-2" />
              <p>No interview events yet.</p>
              <p class="text-xs mt-1">Create one or sync from Google Calendar.</p>
            </div>
          </div>
        </div>

        <!-- Right Column: Events & Creation -->
        <div class="flex-1 space-y-6 min-w-0">
          
          <!-- Event Creation Form -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-calendar-plus" class="size-5 text-[var(--ui-color-primary)]" />
                <span class="font-semibold">Schedule Interview for {{ format(selectedDate, 'MMM d, yyyy') }}</span>
              </div>
            </template>

            <form class="space-y-4" @submit.prevent="handleCreateEvent">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <UFormField label="Job Role">
                  <USelect
                    v-model="createForm.role"
                    :items="jobs.map(j => ({ label: j.role, value: j.role }))"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Date">
                  <UInput v-model="createForm.event_date" type="date" disabled class="w-full" />
                </UFormField>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <UFormField label="Start Time">
                  <UInput v-model="createForm.start_time" type="time" class="w-full" />
                </UFormField>
                <UFormField label="End Time">
                  <UInput v-model="createForm.end_time" type="time" class="w-full" />
                </UFormField>
                <UFormField label="Base Candidates">
                  <UInput v-model.number="createForm.num_candidates" type="number" min="1" class="w-full" />
                </UFormField>
                <UFormField label="Buffer Slots">
                  <UInput v-model.number="createForm.extra_candidates" type="number" min="0" class="w-full" />
                </UFormField>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <UFormField label="Mode">
                  <USelect
                    v-model="createForm.interview_mode"
                    :items="[{label: 'Offline (In-Person)', value: 'offline'}, {label: 'Online (Video Call)', value: 'online'}]"
                    class="w-full"
                  />
                </UFormField>
                <UFormField :label="createForm.interview_mode === 'online' ? 'Meeting Link' : 'Venue Address'">
                  <UInput v-model="createForm.venue_or_link" placeholder="Enter link or address..." class="w-full" />
                </UFormField>
              </div>

              <div class="flex justify-end pt-2">
                <UButton type="submit" color="primary" label="Create Event" icon="i-lucide-plus" />
              </div>
            </form>
          </UCard>

          <!-- Scheduled Events List -->
          <div>
            <h3 class="font-semibold text-lg mb-4 flex items-center gap-2">
              <UIcon name="i-lucide-calendar" class="size-5" />
              Scheduled Events ({{ format(selectedDate, 'MMM d') }})
            </h3>

            <div class="space-y-4">
              <UCard
                v-for="event in filteredEvents"
                :key="event.id"
                class="transition-all"
                :class="expandedEvent === event.id ? 'ring-2 ring-[var(--ui-color-primary)]' : ''"
              >
                <!-- Event Header (Always Visible) -->
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer" @click="toggleEventExpand(event.id)">
                  <div class="flex items-center gap-4">
                    <div class="size-12 rounded-xl bg-elevated/50 flex flex-col items-center justify-center shrink-0">
                      <span class="text-xs font-bold">{{ event.start_time.substring(0, 5) }}</span>
                    </div>
                    <div>
                      <h4 class="font-bold text-lg leading-tight">{{ event.role }}</h4>
                      <div class="flex items-center gap-3 text-sm text-muted mt-1">
                        <span class="flex items-center gap-1"><UIcon name="i-lucide-clock" class="size-3.5" />{{ event.start_time.substring(0, 5) }} - {{ event.end_time.substring(0, 5) }}</span>
                        <span class="flex items-center gap-1">
                          <UIcon :name="event.interview_mode === 'online' ? 'i-lucide-video' : 'i-lucide-map-pin'" class="size-3.5" />
                          <span class="capitalize">{{ event.interview_mode }}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div class="flex items-center gap-3 w-full sm:w-auto" @click.stop>
                    <div v-if="unsentCounts[event.id] > 0" class="flex items-center gap-2 mr-2">
                      <UIcon name="i-lucide-alert-circle" class="size-4 text-warning" />
                      <span class="text-xs font-semibold text-warning">{{ unsentCounts[event.id] }} unsent</span>
                      <UButton size="xs" color="primary" @click="openMailModal(event.id)">Send</UButton>
                    </div>
                    <UButton
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="ghost"
                      size="sm"
                      @click="handleDeleteEvent(event.id)"
                    />
                    <UButton
                      :icon="expandedEvent === event.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      @click="toggleEventExpand(event.id)"
                    />
                  </div>
                </div>

                <!-- Event Details & Candidates (Expanded) -->
                <div v-if="expandedEvent === event.id" class="mt-6 pt-6 border-t border-default space-y-6">
                  
                  <!-- Selection Mode Buttons -->
                  <div v-if="selectionMode === null" class="flex flex-col sm:flex-row gap-3">
                    <UButton
                      icon="i-lucide-mail"
                      class="flex-1 justify-center bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white"
                      @click="openMailModal(event.id)"
                    >
                      Send Invites to Candidates
                    </UButton>
                    <UButton
                      icon="i-lucide-check-square"
                      class="flex-1 justify-center bg-[var(--ui-color-primary)] text-white hover:bg-[var(--ui-color-primary-600)]"
                      @click="startManualSelection(event.id)"
                    >
                      Choose Candidates Manually
                    </UButton>
                    <UButton
                      icon="i-lucide-zap"
                      class="flex-1 justify-center bg-gradient-to-br from-[var(--ui-color-primary)] to-emerald-600 hover:from-[var(--ui-color-primary-400)] hover:to-emerald-500 text-white"
                      @click="handleAutoAssign(event.id)"
                    >
                      Auto Select Top {{ event.num_candidates + (event.extra_candidates || 0) }} by Score
                    </UButton>
                  </div>

                  <!-- Manual Selection Table -->
                  <div v-if="selectionMode === 'manual'">
                    <h4 class="font-semibold text-lg mb-4 flex items-center gap-2">
                      {{ editingEventId ? 'Edit Candidate Selection' : 'Select Candidates for Interview' }}
                      <span class="text-sm font-normal text-muted ml-2">({{ selectedCandidateIds.size }} selected)</span>
                    </h4>
                    
                    <div v-if="loadingCandidates" class="text-center py-8 text-muted">Loading candidates...</div>
                    <div v-else>
                      <div class="border border-default rounded-lg max-h-[400px] overflow-y-auto bg-[var(--ui-bg)] shadow-sm">
                        <table class="w-full text-sm text-left whitespace-nowrap">
                          <thead class="sticky top-0 bg-elevated z-10 border-b border-default shadow-sm">
                            <tr>
                              <th class="p-3 w-12 text-center">
                                <UCheckbox
                                  :model-value="eligibleCandidates.length > 0 && selectedCandidateIds.size === eligibleCandidates.length"
                                  @update:model-value="toggleSelectAll"
                                />
                              </th>
                              <th class="p-3 font-semibold text-muted">Source</th>
                              <th class="p-3 font-semibold text-muted">Name</th>
                              <th class="p-3 font-semibold text-muted">Mail</th>
                              <th class="p-3 font-semibold text-muted">Role</th>
                              <th class="p-3 font-semibold text-muted">Mobile</th>
                              <th class="p-3 font-semibold text-muted">Location</th>
                              <th class="p-3 font-semibold text-muted">CTC</th>
                              <th class="p-3 font-semibold text-muted">Experience</th>
                              <th class="p-3 font-semibold text-muted">Score</th>
                              <th class="p-3 font-semibold text-muted">Resume</th>
                              <th class="p-3 font-semibold text-muted">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-if="eligibleCandidates.length === 0">
                              <td colspan="12" class="p-8 text-center text-muted italic">No eligible candidates found.</td>
                            </tr>
                            <tr
                              v-for="c in eligibleCandidates"
                              :key="c.id"
                              class="border-b border-default last:border-0 hover:bg-elevated/50 transition-colors"
                              :class="{'bg-[var(--ui-color-primary)]/5': selectedCandidateIds.has(c.id)}"
                            >
                              <td class="p-3 text-center">
                                <UCheckbox
                                  :model-value="selectedCandidateIds.has(c.id)"
                                  @update:model-value="toggleCandidateSelect(c.id)"
                                />
                              </td>
                              <td class="p-3">
                                <div class="flex items-center gap-1.5 text-xs">
                                  <UIcon v-if="c.applied_through === 'WhatsApp'" name="i-lucide-message-circle" class="size-4 text-emerald-500" />
                                  <UIcon v-else name="i-lucide-mail" class="size-4 text-red-500" />
                                  {{ c.applied_through }}
                                </div>
                              </td>
                              <td class="p-3 font-semibold">{{ c.name }}</td>
                              <td class="p-3 text-xs text-muted">{{ c.email }}</td>
                              <td class="p-3 text-xs">{{ c.role_applied }}</td>
                              <td class="p-3 text-xs flex items-center gap-1"><UIcon name="i-lucide-phone" class="size-3 opacity-50" /> {{ c.phone }}</td>
                              <td class="p-3 text-xs">
                                <div class="flex items-center gap-1"><UIcon name="i-lucide-map-pin" class="size-3 opacity-50" /> {{ c.current_location }}</div>
                              </td>
                              <td class="p-3 text-xs">{{ c.current_ctc }}</td>
                              <td class="p-3 text-xs">{{ c.experience_level }}</td>
                              <td class="p-3">
                                <UBadge size="xs" variant="subtle" :color="c.score >= 80 ? 'success' : 'warning'" class="font-bold">
                                  {{ c.score }}%
                                </UBadge>
                              </td>
                              <td class="p-3 text-center">
                                <a v-if="c.resume_url" :href="c.resume_url" target="_blank" rel="noopener noreferrer" class="text-[var(--ui-color-primary)] hover:text-[var(--ui-color-primary-600)] transition-colors">
                                  <UIcon name="i-lucide-file-text" class="size-4" />
                                </a>
                                <span v-else class="text-muted">—</span>
                              </td>
                              <td class="p-3">
                                <USelect
                                  v-model="c.status"
                                  :items="[
                                    { label: 'Applied', value: 'applied' },
                                    { label: 'Shortlisted', value: 'shortlisted' },
                                    { label: 'Hold', value: 'hold' },
                                    { label: 'Rejected', value: 'rejected' },
                                    { label: 'Mark as Selected', value: 'marked' },
                                    { label: 'Selected', value: 'selected', disabled: true }
                                  ]"
                                  size="xs"
                                  @change="(newVal) => handleStatusChange(c.id, newVal, event.id)"
                                  class="w-[130px]"
                                />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      
                      <div class="mt-4 flex gap-3">
                        <UButton
                          class="flex-1 justify-center"
                          color="primary"
                          @click="saveManualSelection(event.id)"
                        >
                          <UIcon name="i-lucide-save" class="size-4 mr-2" />
                          {{ editingEventId ? 'Save Changes' : 'Select Candidates for Interview' }}
                        </UButton>
                        <UButton
                          class="flex-1 justify-center bg-white/5"
                          color="neutral"
                          variant="ghost"
                          @click="selectionMode = null; editingEventId = null"
                        >
                          <UIcon name="i-lucide-x" class="size-4 mr-2" /> Cancel
                        </UButton>
                      </div>
                    </div>
                  </div>

                  <!-- Assigned Candidates Display -->
                  <div v-if="selectionMode !== 'manual' && (eventCandidates[event.id]?.length > 0)">
                    <div class="flex justify-between items-center mb-4">
                      <h4 class="font-semibold text-lg text-[var(--ui-color-primary)] flex items-center gap-2">
                        Candidates Chosen for Interview
                        <UBadge size="xs" variant="subtle">{{ eventCandidates[event.id]?.length }}</UBadge>
                      </h4>
                      <div class="flex gap-2">
                        <UButton
                          icon="i-lucide-refresh-cw"
                          color="neutral"
                          variant="ghost"
                          size="sm"
                          title="Refresh List"
                          @click="fetchAssignedCandidates(event.id)"
                        />
                        <UButton
                          icon="i-lucide-edit"
                          color="primary"
                          variant="soft"
                          size="sm"
                          @click="startEditSelection(event.id)"
                        >
                          Edit
                        </UButton>
                      </div>
                    </div>

                    <div class="border border-default rounded-lg overflow-x-auto bg-[var(--ui-bg)] shadow-sm">
                      <table class="w-full text-sm text-left whitespace-nowrap">
                        <thead class="bg-elevated/50 border-b border-default shadow-sm">
                          <tr>
                            <th class="p-3 font-semibold text-muted">Source</th>
                            <th class="p-3 font-semibold text-muted">Name</th>
                            <th class="p-3 font-semibold text-muted">Mail</th>
                            <th class="p-3 font-semibold text-muted">Role</th>
                            <th class="p-3 font-semibold text-muted">Mobile</th>
                            <th class="p-3 font-semibold text-muted">Location</th>
                            <th class="p-3 font-semibold text-muted">CTC</th>
                            <th class="p-3 font-semibold text-muted">Experience</th>
                            <th class="p-3 font-semibold text-muted">Score</th>
                            <th class="p-3 font-semibold text-muted">Resume</th>
                            <th class="p-3 font-semibold text-muted">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="c in eventCandidates[event.id]"
                            :key="c.id"
                            class="border-b border-default last:border-0 hover:bg-elevated/50 transition-colors"
                          >
                            <td class="p-3">
                              <div class="flex items-center gap-1.5 text-xs">
                                <UIcon v-if="c.applied_through === 'WhatsApp'" name="i-lucide-message-circle" class="size-4 text-emerald-500" />
                                <UIcon v-else name="i-lucide-mail" class="size-4 text-red-500" />
                                {{ c.applied_through }}
                              </div>
                            </td>
                            <td class="p-3 font-semibold">{{ c.name }}</td>
                            <td class="p-3 text-xs text-muted">{{ c.email }}</td>
                            <td class="p-3 text-xs">{{ c.role_applied }}</td>
                            <td class="p-3 text-xs flex items-center gap-1"><UIcon name="i-lucide-phone" class="size-3 opacity-50" /> {{ c.phone }}</td>
                            <td class="p-3 text-xs flex items-center gap-1"><UIcon name="i-lucide-map-pin" class="size-3 opacity-50" /> {{ c.current_location }}</td>
                            <td class="p-3 text-xs">{{ c.current_ctc }}</td>
                            <td class="p-3 text-xs">{{ c.experience_level }}</td>
                            <td class="p-3">
                              <UBadge size="xs" variant="subtle" color="success" class="font-bold">{{ c.score }}%</UBadge>
                            </td>
                            <td class="p-3 text-center">
                              <a v-if="c.resume_url" :href="c.resume_url" target="_blank" rel="noopener noreferrer" class="text-[var(--ui-color-primary)] hover:text-[var(--ui-color-primary-600)] transition-colors inline-flex items-center gap-1">
                                <UIcon name="i-lucide-file-text" class="size-4" />
                                <UIcon name="i-lucide-external-link" class="size-3 opacity-70" />
                              </a>
                              <span v-else class="text-muted">—</span>
                            </td>
                            <td class="p-3">
                              <USelect
                                v-model="c.status"
                                :items="[
                                  { label: 'Applied', value: 'applied' },
                                  { label: 'Shortlisted', value: 'shortlisted' },
                                  { label: 'Hold', value: 'hold' },
                                  { label: 'Rejected', value: 'rejected' },
                                  { label: 'Mark as Selected', value: 'marked' },
                                  { label: 'Selected', value: 'selected', disabled: true }
                                ]"
                                size="xs"
                                @change="(newVal) => handleStatusChange(c.id, newVal, event.id)"
                                class="w-[130px]"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              </UCard>

              <p v-if="filteredEvents.length === 0" class="text-center text-muted py-12 border border-dashed border-default rounded-xl">
                No events scheduled for this day.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Mail Template Modal -->
      <UModal v-model:open="mailOpen" title="Send Interview Invites">
        <template #body>
          <p class="text-sm text-muted mb-4">
            Sending to <strong>{{ mailModal.eventId ? (unsentCounts[mailModal.eventId] || 0) : 0 }}</strong> candidates who haven't received invites yet.
          </p>
          <UFormField label="Choose Template">
            <USelect
              v-model="mailModal.templateId"
              :items="templates.filter(t => t.type === 'invite').map(t => ({ label: `${t.name} (Invite)`, value: String(t.id) }))"
              class="w-full"
            />
          </UFormField>
        </template>
        <template #footer>
          <div class="flex gap-3 w-full">
            <UButton
              label="Send Invites"
              color="primary"
              block
              :loading="mailModal.sending"
              :disabled="!mailModal.templateId"
              @click="sendInvites"
            />
            <UButton label="Cancel" color="neutral" variant="outline" block @click="mailOpen = false" />
          </div>
        </template>
      </UModal>

      <!-- Selection Details Modal -->
      <UModal v-model:open="selectionModal.isOpen" title="Selection Details">
        <template #body>
          <p class="text-sm text-muted mb-4">
            Please enter offer details for <strong>{{ selectionModal.candidateName }}</strong>.
          </p>
          <div class="space-y-4">
            <UFormField label="Offered Role" required>
              <UInput v-model="selectionModal.form.offered_role" placeholder="e.g. Senior Frontend Developer" class="w-full" />
            </UFormField>
            <UFormField label="Offered Salary/CTC" required>
              <UInput v-model="selectionModal.form.offered_salary" placeholder="e.g. $120,000" class="w-full" />
            </UFormField>
            <UFormField label="Offered Location" required>
              <UInput v-model="selectionModal.form.offered_location" placeholder="e.g. Remote" class="w-full" />
            </UFormField>
            <UFormField label="Expected Joining Date" required>
              <UInput v-model="selectionModal.form.joining_date" type="date" class="w-full" />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex gap-3 w-full">
            <UButton
              label="Confirm Selection"
              color="primary"
              block
              @click="submitSelection"
            />
            <UButton label="Cancel" color="neutral" variant="outline" block @click="selectionModal.isOpen = false" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

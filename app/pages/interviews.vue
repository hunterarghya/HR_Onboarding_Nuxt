<script setup lang="ts">
import { addMonths, subMonths, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns'
import type { InterviewEvent, Job, Candidate, UnsentCount, EmailTemplate, PaginatedResponse } from '~/types'

const { apiFetch, token } = useApi()
const toast = useToast()

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

// Expanded panels state
const expandedEvents = ref<Record<number, boolean>>({})

// Candidates inside an event
const assignedCandidates = ref<Record<number, Candidate[]>>({})
const manualCandidates = ref<Record<number, Candidate[]>>({})
const manualSearch = ref<Record<number, string>>({})
const selectedManual = ref<Record<number, number[]>>({}) // event_id -> candidate_ids[]

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
    events.value = await apiFetch<InterviewEvent[]>('/interviews')
    
    // Fetch unsent counts
    const res = await apiFetch<UnsentCount[]>('/mail/unsent-counts')
    const counts: Record<number, number> = {}
    res.forEach(r => { counts[r.event_id] = r.unsent_count })
    unsentCounts.value = counts
    
    // Initialize expanded states (none expanded by default)
    events.value.forEach(e => {
      if (expandedEvents.value[e.id] === undefined) {
        expandedEvents.value[e.id] = false
      }
    })
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
    await apiFetch('/interviews', {
      method: 'POST',
      body: createForm
    })
    toast.add({ title: 'Interview event created', color: 'success' })
    // Reset form mostly
    createForm.venue_or_link = ''
    fetchEvents()
  } catch (err) {
    console.error('Error creating event:', err)
    toast.add({ title: 'Failed to create event', color: 'error' })
  }
}

const handleDeleteEvent = async (id: number) => {
  if (!confirm('Are you sure you want to delete this event? Assigned candidates will revert to shortlisted status.')) return
  try {
    await apiFetch(`/interviews/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Event deleted', color: 'success' })
    fetchEvents()
  } catch (err) {
    console.error('Error deleting event:', err)
    toast.add({ title: 'Failed to delete event', color: 'error' })
  }
}

const toggleEventExpanded = async (eventId: number) => {
  expandedEvents.value[eventId] = !expandedEvents.value[eventId]
  if (expandedEvents.value[eventId] && !assignedCandidates.value[eventId]) {
    await fetchAssignedCandidates(eventId)
    // Initialize manual search
    manualSearch.value[eventId] = ''
    selectedManual.value[eventId] = []
  }
}

const fetchAssignedCandidates = async (eventId: number) => {
  try {
    const data = await apiFetch<Candidate[]>(`/interviews/${eventId}/candidates`)
    assignedCandidates.value[eventId] = data
  } catch (err) {
    console.error('Error fetching assigned:', err)
  }
}

const handleAutoAssign = async (event: InterviewEvent) => {
  try {
    const data = await apiFetch<{ message: string, assignedCount: number }>(`/interviews/${event.id}/assign-auto`, {
      method: 'POST'
    })
    toast.add({ title: 'Auto-Assign Complete', description: `Assigned ${data.assignedCount} candidates`, color: 'success' })
    fetchAssignedCandidates(event.id)
    fetchEvents() // refresh unsent counts
  } catch (err: any) {
    console.error('Auto assign error:', err)
    toast.add({ title: 'Auto-assign failed', description: err.data?.error || err.message, color: 'error' })
  }
}

const searchManualCandidates = async (eventId: number, role: string) => {
  try {
    // Only fetch shortlisted unassigned candidates
    const data = await apiFetch<PaginatedResponse<Candidate>>('/candidates', {
      params: { role, status: 'shortlisted', name: manualSearch.value[eventId], limit: 20 }
    })
    manualCandidates.value[eventId] = data.data
  } catch (err) {
    console.error('Search error:', err)
  }
}

const handleManualAssign = async (eventId: number) => {
  const cids = selectedManual.value[eventId] || []
  if (cids.length === 0) return
  try {
    await apiFetch(`/interviews/${eventId}/assign-manual`, {
      method: 'POST',
      body: { candidateIds: cids }
    })
    toast.add({ title: 'Candidates assigned manually', color: 'success' })
    selectedManual.value[eventId] = []
    fetchAssignedCandidates(eventId)
    fetchEvents() // refresh unsent counts
    searchManualCandidates(eventId, events.value.find(e => e.id === eventId)?.role || '')
  } catch (err) {
    console.error('Manual assign error:', err)
    toast.add({ title: 'Assignment failed', color: 'error' })
  }
}

const removeCandidateFromEvent = async (eventId: number, candidateId: number) => {
  try {
    await apiFetch(`/interviews/${eventId}/candidates/${candidateId}`, { method: 'DELETE' })
    toast.add({ title: 'Candidate removed from interview', color: 'success' })
    fetchAssignedCandidates(eventId)
    fetchEvents()
  } catch (err) {
    console.error('Error removing candidate:', err)
    toast.add({ title: 'Failed to remove candidate', color: 'error' })
  }
}

const openMailModal = (eventId: number) => {
  mailModal.eventId = eventId
  const inviteTemplate = templates.value.find(t => t.type === 'invite' && t.is_default)
  mailModal.templateId = inviteTemplate ? String(inviteTemplate.id) : (templates.value[0] ? String(templates.value[0].id) : '')
  mailModal.sending = false
  mailOpen.value = true
}

const sendInvites = async () => {
  if (!mailModal.eventId || !mailModal.templateId) return
  mailModal.sending = true
  try {
    const res = await apiFetch<{ sent: number, failed: number, skipped: number }>('/mail/interview-invites', {
      method: 'POST',
      body: { eventId: mailModal.eventId, templateId: mailModal.templateId },
      headers: { Authorization: `Bearer ${token.value}` }
    })
    toast.add({ title: 'Invites Sent', description: `Sent: ${res.sent}, Failed: ${res.failed}, Skipped: ${res.skipped}`, color: 'success' })
    mailOpen.value = false
    fetchEvents()
    fetchAssignedCandidates(mailModal.eventId)
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

const selectDate = (date: Date) => {
  selectedDate.value = date
  createForm.event_date = format(date, 'yyyy-MM-dd')
}

const filteredEvents = computed(() => {
  const dStr = format(selectedDate.value, 'yyyy-MM-dd')
  return events.value.filter(e => e.event_date.startsWith(dStr))
})

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
                class="relative p-2 rounded-lg flex flex-col items-center justify-center min-h-[44px] transition-colors hover:bg-elevated/50"
                :class="{
                  'bg-[var(--ui-color-primary)] text-white font-bold hover:bg-[var(--ui-color-primary)]': isSameDay(day, selectedDate),
                  'text-[var(--ui-color-primary)] font-bold': isToday(day) && !isSameDay(day, selectedDate),
                  'text-foreground': !isSameDay(day, selectedDate) && !isToday(day)
                }"
                @click="selectDate(day)"
              >
                <span class="text-sm z-10">{{ format(day, 'd') }}</span>
                <!-- Event indicators -->
                <div v-if="getEventsForDay(day).length > 0" class="absolute bottom-1 flex gap-0.5 z-10">
                  <div
                    v-for="(e, idx) in Math.min(getEventsForDay(day).length, 3)"
                    :key="idx"
                    class="size-1 rounded-full"
                    :class="isSameDay(day, selectedDate) ? 'bg-white' : 'bg-[var(--ui-color-primary)]'"
                  ></div>
                </div>
              </button>
            </div>
          </UCard>
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
                :class="expandedEvents[event.id] ? 'ring-2 ring-[var(--ui-color-primary)]' : ''"
              >
                <!-- Event Header (Always Visible) -->
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer" @click="toggleEventExpanded(event.id)">
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
                      :icon="expandedEvents[event.id] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      @click="toggleEventExpanded(event.id)"
                    />
                  </div>
                </div>

                <!-- Event Details & Candidates (Expanded) -->
                <div v-if="expandedEvents[event.id]" class="mt-6 pt-6 border-t border-default space-y-6">
                  
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Auto Assign Box -->
                    <div class="bg-elevated/30 rounded-lg p-4 border border-default">
                      <h5 class="font-semibold mb-2 text-sm flex items-center gap-2">
                        <UIcon name="i-lucide-zap" class="size-4 text-primary" /> Auto Assignment
                      </h5>
                      <p class="text-xs text-muted mb-4">
                        Automatically assign up to <strong>{{ event.num_candidates + event.extra_candidates }}</strong> top-scoring shortlisted candidates.
                      </p>
                      <UButton color="neutral" variant="outline" size="sm" block @click="handleAutoAssign(event)">
                        Auto-Assign Best Candidates
                      </UButton>
                    </div>

                    <!-- Details Box -->
                    <div class="bg-elevated/30 rounded-lg p-4 border border-default">
                      <h5 class="font-semibold mb-2 text-sm">Event Details</h5>
                      <div class="space-y-2 text-sm">
                        <div class="flex justify-between"><span class="text-muted">Target Capacity:</span> <span class="font-medium">{{ event.num_candidates }} + {{ event.extra_candidates }}</span></div>
                        <div class="flex justify-between"><span class="text-muted">Assigned:</span> <span class="font-medium">{{ assignedCandidates[event.id]?.length || 0 }}</span></div>
                        <div class="flex justify-between"><span class="text-muted">Location:</span> <span class="font-medium truncate max-w-[150px]" :title="event.venue_or_link">{{ event.venue_or_link }}</span></div>
                      </div>
                    </div>
                  </div>

                  <USeparator />

                  <!-- Manual Assignment Section -->
                  <div>
                    <h5 class="font-semibold mb-3 flex items-center justify-between">
                      <span>Manual Assignment</span>
                      <div class="flex gap-2">
                        <UInput
                          v-model="manualSearch[event.id]"
                          placeholder="Search candidates..."
                          size="sm"
                          icon="i-lucide-search"
                          @keydown.enter="searchManualCandidates(event.id, event.role)"
                        />
                        <UButton size="sm" color="neutral" variant="solid" @click="searchManualCandidates(event.id, event.role)">Search</UButton>
                      </div>
                    </h5>
                    
                    <div v-if="manualCandidates[event.id] && manualCandidates[event.id].length > 0" class="border border-default rounded-lg max-h-[300px] overflow-y-auto bg-[var(--ui-bg)]">
                      <table class="w-full text-sm">
                        <thead class="sticky top-0 bg-[var(--ui-bg)] z-10 border-b border-default">
                          <tr>
                            <th class="p-2 text-left w-10"></th>
                            <th class="p-2 text-left">Name</th>
                            <th class="p-2 text-left">Score</th>
                            <th class="p-2 text-left">Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="c in manualCandidates[event.id]" :key="c.id" class="border-b border-default last:border-0 hover:bg-elevated/50">
                            <td class="p-2">
                              <UCheckbox
                                :model-value="selectedManual[event.id]?.includes(c.id)"
                                @update:model-value="(val) => {
                                  if (!selectedManual[event.id]) selectedManual[event.id] = []
                                  if (val) selectedManual[event.id].push(c.id)
                                  else selectedManual[event.id] = selectedManual[event.id].filter(id => id !== c.id)
                                }"
                              />
                            </td>
                            <td class="p-2">{{ c.name }}</td>
                            <td class="p-2"><UBadge size="xs" variant="subtle" color="success">{{ c.score }}%</UBadge></td>
                            <td class="p-2 text-muted">{{ c.current_location }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div v-else class="text-sm text-muted italic p-2 border border-default rounded-lg bg-elevated/10">
                      Search to find unassigned shortlisted candidates for this role.
                    </div>
                    
                    <div class="mt-3 flex justify-end">
                      <UButton
                        :disabled="!selectedManual[event.id] || selectedManual[event.id].length === 0"
                        color="primary"
                        size="sm"
                        @click="handleManualAssign(event.id)"
                      >
                        Assign Selected ({{ selectedManual[event.id]?.length || 0 }})
                      </UButton>
                    </div>
                  </div>

                  <USeparator />

                  <!-- Assigned Candidates List -->
                  <div>
                    <h5 class="font-semibold mb-3 flex items-center justify-between">
                      <span>Assigned Candidates ({{ assignedCandidates[event.id]?.length || 0 }})</span>
                      <UButton v-if="unsentCounts[event.id] > 0" color="primary" size="sm" icon="i-lucide-mail" @click="openMailModal(event.id)">
                        Send {{ unsentCounts[event.id] }} Invites
                      </UButton>
                    </h5>

                    <div v-if="assignedCandidates[event.id] && assignedCandidates[event.id].length > 0" class="border border-default rounded-lg overflow-hidden bg-[var(--ui-bg)]">
                      <table class="w-full text-sm">
                        <thead class="bg-elevated/30 border-b border-default">
                          <tr>
                            <th class="p-3 text-left font-medium text-muted">Name</th>
                            <th class="p-3 text-left font-medium text-muted">Phone</th>
                            <th class="p-3 text-left font-medium text-muted">Score</th>
                            <th class="p-3 text-left font-medium text-muted">Invite</th>
                            <th class="p-3 text-right font-medium text-muted">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="c in assignedCandidates[event.id]" :key="c.id" class="border-b border-default last:border-0">
                            <td class="p-3 font-medium">{{ c.name }}</td>
                            <td class="p-3">{{ c.phone }}</td>
                            <td class="p-3"><UBadge size="xs" variant="subtle">{{ c.score }}%</UBadge></td>
                            <td class="p-3">
                              <UBadge :color="(c as any).invite_sent ? 'success' : 'warning'" size="xs" variant="subtle">
                                {{ (c as any).invite_sent ? 'Sent' : 'Pending' }}
                              </UBadge>
                            </td>
                            <td class="p-3 text-right">
                              <UButton
                                icon="i-lucide-user-minus"
                                color="error"
                                variant="ghost"
                                size="xs"
                                @click="removeCandidateFromEvent(event.id, c.id)"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div v-else class="text-sm text-muted italic p-4 text-center border border-default rounded-lg bg-elevated/10">
                      No candidates assigned yet.
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
    </template>
  </UDashboardPanel>
</template>

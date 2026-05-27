<script setup lang="ts">
import type { Candidate, Job, PaginatedResponse, EmailTemplate } from '~/types'

const { apiFetch, token } = useApi()
const toast = useToast()

const candidates = ref<Candidate[]>([])
const selectedCandidates = ref<Candidate[]>([])
const loading = ref(false)
const jobs = ref<Job[]>([])

// Candidate filters & pagination
const filters = reactive({
  role: 'all',
  source: 'all',
  status: 'all',
  scoreSort: 'newest',
  minScore: 0,
  maxScore: 100,
  name: ''
})
const searchTerm = ref('')
const candidatePagination = reactive({
  hasNextPage: false,
  nextCursor: null as string | null,
  currentCursor: null as string | null,
  cursorStack: [] as (string | null)[]
})

// Selected candidates filters & pagination
const selectedFilters = reactive({
  offered_role: 'all',
  offered_location: 'all',
  dateFrom: '',
  dateTo: '',
  offer_sent: 'all'
})
const selectedPagination = reactive({
  hasNextPage: false,
  nextCursor: null as string | null,
  currentCursor: null as string | null,
  cursorStack: [] as (string | null)[]
})
const selectedFilterOptions = ref({ roles: [] as string[], locations: [] as string[] })

// Selection modal
const selectionOpen = ref(false)
const selectionModal = reactive({
  candidateId: null as number | null,
  candidateName: '',
  form: { offered_role: '', offered_salary: '', offered_location: '', joining_date: '' }
})

// Mail modal
const mailOpen = ref(false)
const mailModal = reactive({
  templates: [] as EmailTemplate[],
  selectedTemplateId: '',
  sending: false
})

const fetchJobs = async () => {
  try {
    jobs.value = await apiFetch<Job[]>('/jobs')
  } catch (err) {
    console.error('Error fetching jobs:', err)
  }
}

const fetchCandidates = async (cursor: string | null = null) => {
  loading.value = true
  try {
    const params: Record<string, any> = { limit: 10 }
    if (filters.role && filters.role !== 'all') params.role = filters.role
    if (filters.source && filters.source !== 'all') params.source = filters.source
    if (filters.status && filters.status !== 'all') params.status = filters.status
    if (filters.scoreSort && filters.scoreSort !== 'newest') params.scoreSort = filters.scoreSort
    if (filters.minScore !== 0) params.minScore = filters.minScore
    if (filters.maxScore !== 100) params.maxScore = filters.maxScore
    if (filters.name) params.name = filters.name
    
    if (cursor) params.cursor = cursor
    const response = await apiFetch<PaginatedResponse<Candidate>>('/candidates', { params })
    candidates.value = response.data
    candidatePagination.hasNextPage = response.hasNextPage
    candidatePagination.nextCursor = response.nextCursor
    candidatePagination.currentCursor = cursor
    if (cursor === null) candidatePagination.cursorStack = []
  } catch (err) {
    console.error('Error fetching candidates:', err)
  } finally {
    loading.value = false
  }
}

const fetchSelectedCandidates = async (cursor: string | null = null) => {
  try {
    const params: Record<string, any> = { limit: 10 }
    if (selectedFilters.offered_role && selectedFilters.offered_role !== 'all') params.offered_role = selectedFilters.offered_role
    if (selectedFilters.offered_location && selectedFilters.offered_location !== 'all') params.offered_location = selectedFilters.offered_location
    if (selectedFilters.dateFrom) params.dateFrom = selectedFilters.dateFrom
    if (selectedFilters.dateTo) params.dateTo = selectedFilters.dateTo
    if (selectedFilters.offer_sent && selectedFilters.offer_sent !== 'all') params.offer_sent = selectedFilters.offer_sent

    if (cursor) params.cursor = cursor
    const response = await apiFetch<PaginatedResponse<Candidate>>('/candidates/selected', { params })
    selectedCandidates.value = response.data
    selectedPagination.hasNextPage = response.hasNextPage
    selectedPagination.nextCursor = response.nextCursor
    selectedPagination.currentCursor = cursor
    if (cursor === null) selectedPagination.cursorStack = []
  } catch (err) {
    console.error('Error fetching selected candidates:', err)
  }
}

const fetchSelectedFilterOptions = async () => {
  try {
    selectedFilterOptions.value = await apiFetch('/candidates/selected/filters')
  } catch (err) {
    console.error('Error fetching filter options:', err)
  }
}

const handleStatusChange = async (candidateId: number, newStatus: string) => {
  if (newStatus === 'selected') {
    const candidate = candidates.value.find(c => c.id === candidateId)
    selectionModal.candidateId = candidateId
    selectionModal.candidateName = candidate?.name || ''
    selectionModal.form = {
      offered_role: candidate?.role_applied || '',
      offered_salary: '',
      offered_location: candidate?.current_location || '',
      joining_date: ''
    }
    selectionOpen.value = true
    return
  }
  try {
    await apiFetch(`/candidates/${candidateId}/status`, { method: 'PATCH', body: { status: newStatus } })
    fetchCandidates(candidatePagination.currentCursor)
    if (newStatus !== 'selected') fetchSelectedCandidates()
  } catch (err) {
    console.error('Error updating status:', err)
    toast.add({ title: 'Status update failed', color: 'error' })
  }
}

const submitSelection = async () => {
  const { offered_role, offered_salary, offered_location, joining_date } = selectionModal.form
  if (!offered_role || !offered_salary || !offered_location || !joining_date) {
    toast.add({ title: 'All fields are required', color: 'warning' })
    return
  }
  try {
    await apiFetch(`/candidates/${selectionModal.candidateId}/status`, {
      method: 'PATCH',
      body: { status: 'selected', ...selectionModal.form }
    })
    selectionOpen.value = false
    fetchCandidates(candidatePagination.currentCursor)
    fetchSelectedCandidates()
    fetchSelectedFilterOptions()
    toast.add({ title: 'Candidate selected', color: 'success' })
  } catch (err) {
    console.error('Error submitting selection:', err)
    toast.add({ title: 'Failed to save selection', color: 'error' })
  }
}

const openMailModal = async () => {
  try {
    const templates = await apiFetch<EmailTemplate[]>('/templates')
    mailModal.templates = templates
    mailModal.selectedTemplateId = templates[0]?.id?.toString() || ''
    mailModal.sending = false
    mailOpen.value = true
  } catch (err) {
    console.error('Error fetching templates:', err)
    toast.add({ title: 'Failed to load templates', color: 'error' })
  }
}

const handleSendOfferLetters = async () => {
  if (!mailModal.selectedTemplateId || selectedCandidates.value.length === 0) return
  mailModal.sending = true
  try {
    const candidateIds = selectedCandidates.value.map(c => c.id)
    const res = await apiFetch<{ sent: number; failed: number; skipped: number }>('/mail/offer-letters', {
      method: 'POST',
      body: { templateId: mailModal.selectedTemplateId, candidateIds },
      headers: { Authorization: `Bearer ${token.value}` }
    })
    toast.add({ title: 'Offer letters sent', description: `Sent: ${res.sent}, Failed: ${res.failed}, Skipped: ${res.skipped}`, color: 'success' })
    mailOpen.value = false
    fetchSelectedCandidates()
  } catch (err: any) {
    console.error('Mail error:', err)
    toast.add({ title: 'Failed to send emails', description: err.data?.details || err.message, color: 'error' })
  } finally {
    mailModal.sending = false
  }
}

// Pagination handlers
const handleNextPage = () => {
  if (candidatePagination.nextCursor) {
    candidatePagination.cursorStack.push(candidatePagination.currentCursor)
    fetchCandidates(candidatePagination.nextCursor)
  }
}
const handlePrevPage = () => {
  const prevCursor = candidatePagination.cursorStack.pop() ?? null
  fetchCandidates(prevCursor)
}
const handleSelectedNextPage = () => {
  if (selectedPagination.nextCursor) {
    selectedPagination.cursorStack.push(selectedPagination.currentCursor)
    fetchSelectedCandidates(selectedPagination.nextCursor)
  }
}
const handleSelectedPrevPage = () => {
  const prevCursor = selectedPagination.cursorStack.pop() ?? null
  fetchSelectedCandidates(prevCursor)
}

const statusItems = [
  { label: 'Applied', value: 'applied' },
  { label: 'Shortlisted', value: 'shortlisted' },
  { label: 'Hold', value: 'hold' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Mark as Selected', value: 'marked' },
  { label: 'Selected', value: 'selected' }
]

const statusColor = (status: string) => {
  const map: Record<string, string> = {
    applied: 'info',
    shortlisted: 'success',
    hold: 'warning',
    rejected: 'error',
    marked: 'purple' ,
    selected: 'success'
  }
  return (map[status] || 'neutral') as any
}

const clearFilters = () => {
  Object.assign(filters, { role: 'all', source: 'all', status: 'all', scoreSort: 'newest', minScore: 0, maxScore: 100, name: '' })
  searchTerm.value = ''
}

const hasFilters = computed(() => {
  return filters.role !== 'all' || filters.source !== 'all' || filters.status !== 'all' || filters.scoreSort !== 'newest' || filters.minScore !== 0 || filters.maxScore !== 100 || filters.name !== ''
})

const clearSelectedFilters = () => {
  Object.assign(selectedFilters, { offered_role: 'all', offered_location: 'all', dateFrom: '', dateTo: '', offer_sent: 'all' })
}

const hasSelectedFilters = computed(() => {
  return selectedFilters.offered_role !== 'all' || selectedFilters.offered_location !== 'all' || selectedFilters.dateFrom || selectedFilters.dateTo || selectedFilters.offer_sent !== 'all'
})

// Watchers
watch(() => ({ ...filters }), () => fetchCandidates(null), { deep: true })
watch(() => ({ ...selectedFilters }), () => fetchSelectedCandidates(null), { deep: true })

onMounted(() => {
  fetchJobs()
  fetchCandidates()
  fetchSelectedCandidates()
  fetchSelectedFilterOptions()
})
</script>

<template>
  <UDashboardPanel id="candidates">
    <template #header>
      <UDashboardNavbar title="Candidates">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            @click="fetchCandidates(null)"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Shortlisted Candidates Section -->
      <div class="space-y-4 mb-8">
        <h3 class="font-semibold flex items-center gap-2">
          <UIcon name="i-lucide-search" class="size-5" />
          Shortlisted Candidates
        </h3>

        <!-- Filter Bar -->
        <div class="space-y-3">
          <div class="flex gap-3 flex-wrap">
            <div class="flex gap-2 flex-1 min-w-[300px]">
              <UInput
                v-model="searchTerm"
                placeholder="Search by name..."
                icon="i-lucide-search"
                class="flex-1"
                @keydown.enter="filters.name = searchTerm"
              />
              <UButton icon="i-lucide-search" color="primary" @click="filters.name = searchTerm" />
            </div>

            <USelect
              v-model="filters.role"
              :items="[{ label: 'All Roles', value: 'all' }, { label: 'Open', value: 'Open' }, ...jobs.map(j => ({ label: j.role, value: j.role }))]"
              class="min-w-[150px]"
            />
            <USelect
              v-model="filters.source"
              :items="[{ label: 'All Sources', value: 'all' }, { label: 'Gmail', value: 'Gmail' }, { label: 'WhatsApp', value: 'WhatsApp' }]"
              class="min-w-[150px]"
            />
            <USelect
              v-model="filters.status"
              :items="[{ label: 'All Statuses', value: 'all' }, ...statusItems]"
              class="min-w-[150px]"
            />
          </div>

          <div class="flex gap-4 items-center flex-wrap p-3 bg-elevated/50 rounded-lg">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-muted">Score Sort:</span>
              <USelect
                v-model="filters.scoreSort"
                :items="[{ label: 'Newest First', value: 'newest' }, { label: 'High to Low', value: 'highToLow' }, { label: 'Low to High', value: 'lowToHigh' }]"
                class="min-w-[140px]"
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-muted">Score Range:</span>
              <UInput v-model.number="filters.minScore" type="number" :min="0" :max="100" class="w-[70px]" />
              <span class="text-muted text-xs">to</span>
              <UInput v-model.number="filters.maxScore" type="number" :min="0" :max="100" class="w-[70px]" />
            </div>
            <UButton
              v-if="hasFilters"
              label="Clear Filters"
              color="error"
              variant="subtle"
              size="xs"
              @click="clearFilters"
            />
          </div>
        </div>

        <!-- Candidates Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-default">
                <th class="text-left py-3 px-3 text-muted font-medium">Name</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Source</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Role</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Mobile</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Location</th>
                <th class="text-left py-3 px-3 text-muted font-medium">CTC</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Experience</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Score</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Resume</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in candidates" :key="c.id" class="border-b border-default hover:bg-elevated/30">
                <td class="py-3 px-3">
                  <p class="font-medium">{{ c.name }}</p>
                  <p class="text-xs text-muted">{{ c.email }}</p>
                </td>
                <td class="py-3 px-3">
                  <div class="flex items-center gap-1.5">
                    <UIcon
                      :name="c.applied_through === 'WhatsApp' ? 'i-lucide-message-circle' : 'i-lucide-mail'"
                      :class="c.applied_through === 'WhatsApp' ? 'text-[var(--ui-color-success)]' : 'text-[var(--ui-color-error)]'"
                      class="size-4"
                    />
                    <span class="text-xs">{{ c.applied_through }}</span>
                  </div>
                </td>
                <td class="py-3 px-3">{{ c.role_applied }}</td>
                <td class="py-3 px-3 text-sm">{{ c.phone }}</td>
                <td class="py-3 px-3 text-sm">{{ c.current_location }}</td>
                <td class="py-3 px-3 text-sm font-medium">{{ c.current_ctc }}</td>
                <td class="py-3 px-3 text-sm">{{ c.experience_level }}</td>
                <td class="py-3 px-3">
                  <UBadge
                    :color="c.score >= 80 ? 'success' : 'warning'"
                    variant="subtle"
                    size="sm"
                  >
                    {{ c.score }}%
                  </UBadge>
                </td>
                <td class="py-3 px-3">
                  <UButton
                    v-if="c.resume_url"
                    :to="c.resume_url"
                    target="_blank"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-file-text"
                    trailing-icon="i-lucide-external-link"
                    label="PDF"
                  />
                  <span v-else class="text-xs text-muted">No PDF</span>
                </td>
                <td class="py-3 px-3">
                  <USelect
                    :model-value="c.status"
                    :items="statusItems"
                    size="xs"
                    class="min-w-[120px]"
                    @update:model-value="handleStatusChange(c.id, $event)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="candidates.length === 0 && !loading" class="text-center text-muted py-8">
            No candidates found yet.
          </p>
        </div>

        <!-- Pagination -->
        <div class="flex items-center justify-center gap-4 pt-4 border-t border-default">
          <UButton
            icon="i-lucide-chevron-left"
            label="Previous"
            color="neutral"
            variant="outline"
            :disabled="candidatePagination.cursorStack.length === 0"
            @click="handlePrevPage"
          />
          <span class="text-sm text-muted">Page {{ candidatePagination.cursorStack.length + 1 }}</span>
          <UButton
            icon="i-lucide-chevron-right"
            trailing
            label="Next"
            color="neutral"
            variant="outline"
            :disabled="!candidatePagination.hasNextPage"
            @click="handleNextPage"
          />
        </div>
      </div>

      <USeparator class="my-6" />

      <!-- Selected Candidates Section -->
      <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <h3 class="font-semibold flex items-center gap-2 text-[var(--ui-color-primary)]">
            <UIcon name="i-lucide-users" class="size-5" />
            Selected Candidates
          </h3>
          <div class="flex gap-2">
            <UButton
              icon="i-lucide-mail"
              label="Send Offer Letters"
              color="primary"
              @click="openMailModal"
            />
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              @click="fetchSelectedCandidates(null)"
            />
          </div>
        </div>

        <!-- Selected Filters -->
        <div class="flex gap-3 flex-wrap items-center">
          <USelect
            v-model="selectedFilters.offered_role"
            :items="[{ label: 'All Roles', value: 'all' }, ...selectedFilterOptions.roles.map(r => ({ label: r, value: r }))]"
            class="min-w-[150px]"
          />
          <USelect
            v-model="selectedFilters.offered_location"
            :items="[{ label: 'All Locations', value: 'all' }, ...selectedFilterOptions.locations.map(l => ({ label: l, value: l }))]"
            class="min-w-[150px]"
          />
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-muted">Joining:</span>
            <UInput v-model="selectedFilters.dateFrom" type="date" class="w-[140px]" />
            <span class="text-xs text-muted">to</span>
            <UInput v-model="selectedFilters.dateTo" type="date" class="w-[140px]" />
          </div>
          <USelect
            v-model="selectedFilters.offer_sent"
            :items="[{ label: 'All Offer Status', value: 'all' }, { label: 'Not Sent', value: 'false' }, { label: 'Sent', value: 'true' }]"
            class="min-w-[140px]"
          />
          <UButton
            v-if="hasSelectedFilters"
            label="Clear Filters"
            color="error"
            variant="subtle"
            size="xs"
            @click="clearSelectedFilters"
          />
        </div>

        <!-- Selected Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-default">
                <th class="text-left py-3 px-3 text-muted font-medium">Name</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Email</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Phone</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Role Offered</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Joining Date</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Salary Offered</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Location</th>
                <th class="text-left py-3 px-3 text-muted font-medium">Offer Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in selectedCandidates" :key="c.id" class="border-b border-default hover:bg-elevated/30">
                <td class="py-3 px-3 font-medium">{{ c.name }}</td>
                <td class="py-3 px-3 text-muted text-xs">{{ c.email }}</td>
                <td class="py-3 px-3">{{ c.phone }}</td>
                <td class="py-3 px-3 font-semibold text-[var(--ui-color-primary)]">{{ c.offered_role }}</td>
                <td class="py-3 px-3">{{ c.joining_date ? new Date(c.joining_date).toLocaleDateString() : '—' }}</td>
                <td class="py-3 px-3">{{ c.offered_salary }}</td>
                <td class="py-3 px-3">{{ c.offered_location }}</td>
                <td class="py-3 px-3">
                  <UBadge
                    :color="c.offer_sent ? 'success' : 'warning'"
                    variant="subtle"
                    size="sm"
                  >
                    {{ c.offer_sent ? 'Sent' : 'Pending' }}
                  </UBadge>
                </td>
              </tr>
              <tr v-if="selectedCandidates.length === 0">
                <td colspan="8" class="text-center py-8 text-muted">No selected candidates found.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Selected Pagination -->
        <div class="flex items-center justify-center gap-4 pt-4 border-t border-default">
          <UButton
            icon="i-lucide-chevron-left"
            label="Previous"
            color="neutral"
            variant="outline"
            :disabled="selectedPagination.cursorStack.length === 0"
            @click="handleSelectedPrevPage"
          />
          <span class="text-sm text-muted">Page {{ selectedPagination.cursorStack.length + 1 }}</span>
          <UButton
            icon="i-lucide-chevron-right"
            trailing
            label="Next"
            color="neutral"
            variant="outline"
            :disabled="!selectedPagination.hasNextPage"
            @click="handleSelectedNextPage"
          />
        </div>
      </div>

      <!-- Selection Details Modal -->
      <UModal v-model:open="selectionOpen" title="Finalize Selection">
        <template #body>
          <p class="text-sm text-muted mb-4">
            Enter offer details for <strong class="text-highlighted">{{ selectionModal.candidateName }}</strong>. All fields are required.
          </p>
          <div class="space-y-4">
            <UFormField label="Offered Role">
              <UInput v-model="selectionModal.form.offered_role" placeholder="e.g. Senior Frontend Engineer" class="w-full" />
            </UFormField>
            <UFormField label="Salary Offered">
              <UInput v-model="selectionModal.form.offered_salary" placeholder="e.g. ₹12,00,000 / year" class="w-full" />
            </UFormField>
            <UFormField label="Location">
              <UInput v-model="selectionModal.form.offered_location" placeholder="e.g. Remote / Bangalore" class="w-full" />
            </UFormField>
            <UFormField label="Joining Date">
              <UInput v-model="selectionModal.form.joining_date" type="date" class="w-full" />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex gap-3 w-full">
            <UButton label="Confirm Selection" color="primary" block @click="submitSelection" />
            <UButton label="Cancel" color="neutral" variant="outline" block @click="selectionOpen = false" />
          </div>
        </template>
      </UModal>

      <!-- Mail Template Modal -->
      <UModal v-model:open="mailOpen" title="Send Offer Letters">
        <template #body>
          <p class="text-sm text-muted mb-4">
            Sending to <strong>{{ selectedCandidates.length }}</strong> filtered candidates. Only those who haven't received an offer yet will be processed.
          </p>
          <UFormField label="Choose Template">
            <USelect
              v-model="mailModal.selectedTemplateId"
              :items="mailModal.templates.map(t => ({ label: `${t.name} (${t.type})`, value: String(t.id) }))"
              class="w-full"
            />
          </UFormField>
        </template>
        <template #footer>
          <div class="flex gap-3 w-full">
            <UButton
              label="Send Offers"
              color="primary"
              block
              :loading="mailModal.sending"
              :disabled="!mailModal.selectedTemplateId"
              @click="handleSendOfferLetters"
            />
            <UButton label="Cancel" color="neutral" variant="outline" block @click="mailOpen = false" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

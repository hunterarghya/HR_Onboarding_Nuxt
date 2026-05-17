<script setup lang="ts">
import type { Job } from '~/types'

const { apiFetch } = useApi()
const toast = useToast()

const jobs = ref<Job[]>([])
const submittingJob = ref(false)
const viewingJob = ref<Job | null>(null)
const editingJob = ref<Job | null>(null)
const viewOpen = ref(false)
const editOpen = ref(false)

const newJob = reactive({
  role: '',
  salary: '',
  qualification: '',
  skills: '',
  experience: '',
  location: '',
  shortlist_mode: 'manual' as 'manual' | 'auto',
  deadline: '',
  min_score: 60,
  criteria_weights: {} as Record<string, number>
})

const criteriaKeys = ['skills', 'projects', 'experience']

const fetchJobs = async () => {
  try {
    jobs.value = await apiFetch<Job[]>('/jobs')
  } catch (err) {
    console.error('Error fetching jobs:', err)
  }
}

const handleCreateJob = async () => {
  if (submittingJob.value) return
  submittingJob.value = true
  try {
    await apiFetch('/jobs', { method: 'POST', body: { ...newJob } })
    Object.assign(newJob, {
      role: '', salary: '', qualification: '', skills: '', experience: '',
      location: '', shortlist_mode: 'manual', deadline: '', min_score: 60, criteria_weights: {}
    })
    toast.add({ title: 'Job posted successfully', color: 'success' })
    await fetchJobs()
  } catch (err) {
    console.error('Error creating job:', err)
    toast.add({ title: 'Failed to create job', color: 'error' })
  } finally {
    submittingJob.value = false
  }
}

const openViewJob = (job: Job) => {
  viewingJob.value = job
  viewOpen.value = true
}

const openEditJob = (job: Job) => {
  editingJob.value = { ...job, criteria_weights: { ...(job.criteria_weights || {}) } }
  editOpen.value = true
}

const handleUpdateJob = async () => {
  if (!editingJob.value) return
  try {
    await apiFetch(`/jobs/${editingJob.value.id}`, { method: 'PATCH', body: editingJob.value })
    editOpen.value = false
    editingJob.value = null
    toast.add({ title: 'Job updated successfully', color: 'success' })
    fetchJobs()
  } catch (err) {
    console.error('Error updating job:', err)
    toast.add({ title: 'Update failed', color: 'error' })
  }
}

const handleDeleteJob = async (id: number) => {
  try {
    await apiFetch(`/jobs/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Job deleted', color: 'success' })
    fetchJobs()
  } catch (err) {
    console.error('Error deleting job:', err)
    toast.add({ title: 'Delete failed', color: 'error' })
  }
}

const isExpired = (job: Job) => {
  return job.deadline && new Date(job.deadline) < new Date()
}

const formatDeadline = (deadline: string) => {
  if (!deadline) return 'N/A'
  return new Date(deadline).toLocaleString()
}

onMounted(() => {
  fetchJobs()
})
</script>

<template>
  <UDashboardPanel id="jobs">
    <template #header>
      <UDashboardNavbar title="Jobs">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Job Creation Form -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-plus" class="size-5" />
              <span class="font-semibold">Create Job Role</span>
            </div>
          </template>

          <form class="space-y-4" @submit.prevent="handleCreateJob">
            <UFormField label="Job Role">
              <UInput v-model="newJob.role" placeholder="e.g. Backend Developer" required class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Salary">
                <UInput v-model="newJob.salary" placeholder="$100k - $120k" class="w-full" />
              </UFormField>
              <UFormField label="Location">
                <UInput v-model="newJob.location" placeholder="Remote / NYC" class="w-full" />
              </UFormField>
            </div>

            <UFormField label="Experience Required">
              <UInput v-model="newJob.experience" placeholder="3+ Years" class="w-full" />
            </UFormField>

            <UFormField label="Skills (Comma separated)">
              <UInput v-model="newJob.skills" placeholder="Node.js, Postgres, Redis" class="w-full" />
            </UFormField>

            <UFormField label="Qualifications">
              <UTextarea v-model="newJob.qualification" placeholder="Degree in CS..." :rows="3" class="w-full" />
            </UFormField>

            <USeparator />

            <p class="text-xs font-semibold uppercase tracking-wide text-muted">Advanced Settings</p>

            <!-- Shortlisting Mode -->
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold">Shortlisting Mode</p>
                <p class="text-xs text-muted">Auto will process candidates immediately</p>
              </div>
              <div class="flex items-center gap-3">
                <USwitch
                  :model-value="newJob.shortlist_mode === 'auto'"
                  @update:model-value="newJob.shortlist_mode = $event ? 'auto' : 'manual'"
                />
                <span class="text-xs font-semibold min-w-12">{{ newJob.shortlist_mode.toUpperCase() }}</span>
              </div>
            </div>

            <!-- Deadline -->
            <UFormField label="Application Deadline">
              <UInput v-model="newJob.deadline" type="datetime-local" required class="w-full" />
            </UFormField>

            <!-- Min Score -->
            <UFormField label="Minimum Match Score">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-muted">Score threshold</span>
                <UBadge color="primary" variant="subtle">{{ newJob.min_score }}%</UBadge>
              </div>
              <input
                v-model.number="newJob.min_score"
                type="range"
                min="0"
                max="100"
                class="w-full accent-[var(--ui-color-primary)]"
              />
            </UFormField>

            <USeparator />

            <!-- Criteria Weights -->
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">Scoring Criteria (Optional)</p>
            <p class="text-xs text-muted">Set weights for each criterion. Leave at 0 to ignore.</p>

            <div v-for="key in criteriaKeys" :key="key" class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-sm capitalize">{{ key }}</span>
                <UBadge variant="subtle" color="neutral">{{ newJob.criteria_weights[key] || 0 }}</UBadge>
              </div>
              <input
                :value="newJob.criteria_weights[key] || 0"
                type="range"
                min="0"
                max="10"
                class="w-full accent-[var(--ui-color-primary)]"
                @input="(e: Event) => { const v = parseInt((e.target as HTMLInputElement).value); if (v === 0) { delete newJob.criteria_weights[key]; } else { newJob.criteria_weights[key] = v; } }"
              />
            </div>

            <UButton
              type="submit"
              :loading="submittingJob"
              block
              color="primary"
              size="lg"
              class="mt-4"
            >
              {{ submittingJob ? 'Posting Job...' : 'Post Job Description' }}
            </UButton>
          </form>
        </UCard>

        <!-- Active Jobs List -->
        <UCard>
          <template #header>
            <span class="font-semibold">Active Job Roles</span>
          </template>

          <div class="space-y-3">
            <UCard
              v-for="job in jobs"
              :key="job.id"
              :class="{ 'opacity-60': isExpired(job) }"
              :ui="{ body: 'relative' }"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <p class="font-semibold truncate">{{ job.role }}</p>
                    <UBadge v-if="isExpired(job)" color="error" variant="solid" size="xs">CLOSED</UBadge>
                  </div>
                  <p class="text-sm text-muted">{{ job.location }} • {{ job.salary }}</p>
                  <p class="text-xs mt-1 text-muted">{{ job.skills }}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <UButton
                    icon="i-lucide-eye"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    @click="openViewJob(job)"
                  />
                  <UButton
                    icon="i-lucide-pencil"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    @click="openEditJob(job)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="xs"
                    @click="handleDeleteJob(job.id)"
                  />
                </div>
              </div>
            </UCard>

            <p v-if="jobs.length === 0" class="text-center text-muted py-8">
              No jobs posted yet.
            </p>
          </div>
        </UCard>
      </div>

      <!-- View Job Modal -->
      <UModal v-model:open="viewOpen" title="Job Details">
        <template #body>
          <div v-if="viewingJob" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <p class="text-xs text-muted font-semibold">Role</p>
                <p class="text-sm font-medium">{{ viewingJob.role }}</p>
              </div>
              <div>
                <p class="text-xs text-muted font-semibold">Location</p>
                <p class="text-sm">{{ viewingJob.location || 'N/A' }}</p>
              </div>
              <div>
                <p class="text-xs text-muted font-semibold">Salary</p>
                <p class="text-sm">{{ viewingJob.salary || 'N/A' }}</p>
              </div>
              <div>
                <p class="text-xs text-muted font-semibold">Experience</p>
                <p class="text-sm">{{ viewingJob.experience || 'N/A' }}</p>
              </div>
              <div>
                <p class="text-xs text-muted font-semibold">Skills</p>
                <p class="text-sm">{{ viewingJob.skills || 'N/A' }}</p>
              </div>
              <div>
                <p class="text-xs text-muted font-semibold">Shortlisting</p>
                <p class="text-sm">{{ viewingJob.shortlist_mode?.toUpperCase() }}</p>
              </div>
              <div>
                <p class="text-xs text-muted font-semibold">Min Score</p>
                <p class="text-sm">{{ viewingJob.min_score }}%</p>
              </div>
              <div>
                <p class="text-xs text-muted font-semibold">Deadline</p>
                <p class="text-sm">{{ formatDeadline(viewingJob.deadline) }}</p>
              </div>
            </div>
            <div>
              <p class="text-xs text-muted font-semibold">Qualifications</p>
              <p class="text-sm whitespace-pre-wrap mt-1">{{ viewingJob.qualification }}</p>
            </div>
          </div>
        </template>
        <template #footer>
          <UButton label="Close" color="neutral" variant="outline" block @click="viewOpen = false" />
        </template>
      </UModal>

      <!-- Edit Job Modal -->
      <UModal v-model:open="editOpen" title="Edit Job Role">
        <template #body>
          <form v-if="editingJob" class="space-y-4" @submit.prevent="handleUpdateJob">
            <UFormField label="Job Role">
              <UInput v-model="editingJob.role" required class="w-full" />
            </UFormField>
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Salary">
                <UInput v-model="editingJob.salary" class="w-full" />
              </UFormField>
              <UFormField label="Location">
                <UInput v-model="editingJob.location" class="w-full" />
              </UFormField>
            </div>
            <UFormField label="Experience Required">
              <UInput v-model="editingJob.experience" class="w-full" />
            </UFormField>
            <UFormField label="Skills">
              <UInput v-model="editingJob.skills" class="w-full" />
            </UFormField>
            <UFormField label="Qualifications">
              <UTextarea v-model="editingJob.qualification" :rows="3" class="w-full" />
            </UFormField>

            <USeparator />

            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold">Shortlisting Mode</p>
                <p class="text-xs text-muted">Auto will process candidates immediately</p>
              </div>
              <div class="flex items-center gap-3">
                <USwitch
                  :model-value="editingJob.shortlist_mode === 'auto'"
                  @update:model-value="editingJob.shortlist_mode = $event ? 'auto' : 'manual'"
                />
                <span class="text-xs font-semibold min-w-12">{{ editingJob.shortlist_mode?.toUpperCase() }}</span>
              </div>
            </div>

            <UFormField label="Application Deadline">
              <UInput
                :model-value="editingJob.deadline ? new Date(editingJob.deadline).toISOString().slice(0, 16) : ''"
                type="datetime-local"
                class="w-full"
                @update:model-value="editingJob.deadline = $event"
              />
            </UFormField>

            <UFormField label="Minimum Match Score">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-muted">Score threshold</span>
                <UBadge color="primary" variant="subtle">{{ editingJob.min_score }}%</UBadge>
              </div>
              <input
                v-model.number="editingJob.min_score"
                type="range"
                min="0"
                max="100"
                class="w-full accent-[var(--ui-color-primary)]"
              />
            </UFormField>

            <USeparator />
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">Scoring Criteria (Optional)</p>
            <div v-for="key in criteriaKeys" :key="key" class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-sm capitalize">{{ key }}</span>
                <UBadge variant="subtle" color="neutral">{{ editingJob.criteria_weights?.[key] || 0 }}</UBadge>
              </div>
              <input
                :value="editingJob.criteria_weights?.[key] || 0"
                type="range"
                min="0"
                max="10"
                class="w-full accent-[var(--ui-color-primary)]"
                @input="(e: Event) => { if (!editingJob) return; const v = parseInt((e.target as HTMLInputElement).value); if (!editingJob.criteria_weights) editingJob.criteria_weights = {}; if (v === 0) { delete editingJob.criteria_weights[key]; } else { editingJob.criteria_weights[key] = v; } }"
              />
            </div>

            <div class="flex gap-3 mt-4">
              <UButton type="submit" color="primary" block>Save Changes</UButton>
              <UButton color="neutral" variant="outline" block @click="editOpen = false">Cancel</UButton>
            </div>
          </form>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import type { WAStatus, WAGroup, GoogleForm } from '~/types'

const { apiFetch } = useApi()
const { runTask, waitForTask } = useTask()
const toast = useToast()

// --- Email Scanner State ---
const scanningMail = ref(false)
const mailProgress = ref<TaskProgress | null>(null)
const setMailProgress = (p: TaskProgress) => {
  mailProgress.value = p
}
const mailLastScanned = ref<string | null>(null)
const waLastScanned = ref<string | null>(null)

// --- WhatsApp State ---
const scanningWA = ref(false)
const waProgress = ref<TaskProgress | null>(null)
const setWAProgress = (p: TaskProgress) => {
  waProgress.value = p
}
const waStatus = ref<WAStatus>({ status: 'not connected', qrCodeData: null })
const waGroups = ref<WAGroup[]>([])
const selectedGroups = ref<string[]>([])
const showQR = ref(false)

// --- Google Forms State ---
const scanningForms = ref(false)
const formsProgress = ref<TaskProgress | null>(null)
const setFormsProgress = (p: TaskProgress) => {
  formsProgress.value = p
}
const formsLastScanned = ref<string | null>(null)
const googleForms = ref<GoogleForm[]>([])
const selectedFormIds = ref<Set<string>>(new Set())

let statusInterval: ReturnType<typeof setInterval> | null = null

// --- Fetch scan status ---
const fetchScanStatus = async () => {
  try {
    const status = await apiFetch<Record<string, { lastScannedAt: string | null, running: boolean }>>('/candidates/scan-status')
    mailLastScanned.value = status.gmail?.lastScannedAt || null
    waLastScanned.value = status.whatsapp?.lastScannedAt || null
    formsLastScanned.value = status.google_forms?.lastScannedAt || null
    // A scan started earlier (another tab, before a reload) is still running: follow it
    if (status.gmail?.running && !scanningMail.value) followMailScan()
    if (status.whatsapp?.running && !scanningWA.value) followWAScan()
    if (status.google_forms?.running && !scanningForms.value) followFormsScan()
  } catch (err) {
    console.error('Error fetching scan status:', err)
  }
}

// --- Email Scanner ---
type ScanResult = { message: string, count: number }

// Each scan is a background task: start it (or follow the one already running), then wait for its result
const trackMailScan = async (task: Promise<ScanResult>) => {
  scanningMail.value = true
  mailProgress.value = null
  try {
    const response = await task
    toast.add({ title: 'Email Scan Complete', description: `${response.count} candidate(s) found`, color: 'success' })
    await fetchScanStatus()
  } catch (err) {
    console.error('Error scanning emails:', err)
    toast.add({ title: 'Email scan failed', description: (err as Error).message || 'Check logs.', color: 'error' })
  } finally {
    scanningMail.value = false
  }
}
const handleMailScan = () => trackMailScan(runTask<ScanResult>(
  () => apiFetch('/candidates/scan-mail', { method: 'POST' }),
  { taskIdOnConflict: 'scan.gmail', onProgress: setMailProgress }
))
const followMailScan = () => trackMailScan(waitForTask<ScanResult>('scan.gmail', setMailProgress))

// --- WhatsApp ---
const fetchWAStatus = async () => {
  try {
    waStatus.value = await apiFetch<WAStatus>('/whatsapp/status')
  } catch (err) {
    console.error('Error fetching WA status:', err)
  }
}

const fetchWAGroups = async () => {
  try {
    waGroups.value = await apiFetch<WAGroup[]>('/whatsapp/groups')
  } catch (err) {
    console.error('Error fetching WA groups:', err)
    toast.add({ title: 'Couldn\'t load WhatsApp groups', description: 'Try Refresh in a moment, or check the app logs.', color: 'error' })
  }
}

const trackWAScan = async (task: Promise<ScanResult>) => {
  scanningWA.value = true
  waProgress.value = null
  try {
    const response = await task
    toast.add({ title: 'WhatsApp Scan Complete', description: `${response.count} candidate(s) found`, color: 'success' })
  } catch (err) {
    console.error('Error scanning:', err)
    toast.add({ title: 'WhatsApp scan failed', description: (err as Error).message || 'Check logs.', color: 'error' })
  } finally {
    scanningWA.value = false
  }
}
const handleWAScan = () => trackWAScan(runTask<ScanResult>(
  () => apiFetch('/candidates/scan', { method: 'POST', body: { whatsappGroupIds: selectedGroups.value } }),
  { taskIdOnConflict: 'scan.whatsapp', onProgress: setWAProgress }
))
const followWAScan = () => trackWAScan(waitForTask<ScanResult>('scan.whatsapp', setWAProgress))

const getStatusColor = computed(() => {
  switch (waStatus.value.status) {
    case 'ready': return 'success' as const
    case 'authenticated': return 'info' as const
    case 'qr': return 'warning' as const
    case 'error': return 'error' as const
    default: return 'neutral' as const
  }
})

/** The WhatsApp client's state in plain words */
const statusText = computed(() => ({
  ready: 'Connected',
  authenticated: 'Connecting…',
  qr: 'Waiting for you to scan the QR code',
  initializing: 'Starting…',
  error: 'Couldn\'t start; retrying shortly…',
  disconnected: 'Disconnected'
} as Record<string, string>)[waStatus.value.status] ?? 'Not connected')

const isWAScanDisabled = computed(() => {
  return scanningWA.value || (selectedGroups.value.length > 0 && waStatus.value.status !== 'ready')
})

// --- Google Forms ---
const fetchGoogleForms = async () => {
  try {
    googleForms.value = await apiFetch<GoogleForm[]>('/google-forms')
    // Default: all forms selected (empty set = scan all)
    selectedFormIds.value = new Set()
  } catch (err) {
    console.error('Error fetching Google Forms:', err)
  }
}

const toggleFormSelection = (formId: string) => {
  const newSet = new Set(selectedFormIds.value)
  if (newSet.has(formId)) {
    newSet.delete(formId)
  } else {
    newSet.add(formId)
  }
  selectedFormIds.value = newSet
}

const isFormSelected = (formId: string) => {
  // If no forms are explicitly selected, all are considered selected
  return selectedFormIds.value.size === 0 || selectedFormIds.value.has(formId)
}

const trackFormsScan = async (task: Promise<ScanResult>) => {
  scanningForms.value = true
  formsProgress.value = null
  try {
    const response = await task
    toast.add({ title: 'Forms Scan Complete', description: `${response.count} candidate(s) found`, color: 'success' })
    await fetchScanStatus()
  } catch (err) {
    console.error('Error scanning forms:', err)
    toast.add({ title: 'Forms scan failed', description: (err as Error).message || 'Check logs.', color: 'error' })
  } finally {
    scanningForms.value = false
  }
}
const handleFormsScan = () => {
  const body: { formIds?: string[] } = {}
  if (selectedFormIds.value.size > 0) {
    body.formIds = Array.from(selectedFormIds.value)
  }
  return trackFormsScan(runTask<ScanResult>(
    () => apiFetch('/candidates/scan-forms', { method: 'POST', body }),
    { taskIdOnConflict: 'scan.forms', onProgress: setFormsProgress }
  ))
}
const followFormsScan = () => trackFormsScan(waitForTask<ScanResult>('scan.forms', setFormsProgress))

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Copied!', description: 'Form URL copied to clipboard.', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', color: 'error' })
  }
}

// --- Utilities ---
const formatLastScanned = (dateStr: string | null) => {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

watch(() => waStatus.value.status, (status) => {
  if (status === 'ready') {
    fetchWAGroups()
  }
})

onMounted(() => {
  fetchScanStatus()
  fetchWAStatus()
  fetchGoogleForms()
  statusInterval = setInterval(fetchWAStatus, 5000)
})

onUnmounted(() => {
  if (statusInterval) clearInterval(statusInterval)
})
</script>

<template>
  <UDashboardPanel id="scanners">
    <template #header>
      <UDashboardNavbar title="Scanners">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <!-- ===== 1. Email Scanner Section ===== -->
        <UCard>
          <div class="space-y-4">
            <div class="flex items-center justify-between flex-wrap gap-4">
              <div class="flex items-center gap-4">
                <div class="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <UIcon name="i-lucide-mail" class="size-6 text-primary" />
                </div>
                <div>
                  <p class="font-semibold text-lg">
                    Email Scanner
                  </p>
                  <p class="text-sm text-muted">
                    Last scanned: {{ formatLastScanned(mailLastScanned) }}
                  </p>
                </div>
              </div>

              <ActionButton
                label="Scan Emails"
                icon="i-lucide-mail-search"
                :loading="scanningMail"
                :loading-label="`Scanning… ${formatTaskProgress(mailProgress)}`"
                @click="handleMailScan"
              />
            </div>

            <UAlert
              icon="i-lucide-info"
              color="info"
              variant="subtle"
              title="Gmail Scanner"
              description="Scans your Gmail inbox for job application emails with resume PDF attachments."
            />
          </div>
        </UCard>

        <!-- ===== 2. WhatsApp Connector Section ===== -->
        <UCard>
          <div class="flex items-center justify-between flex-wrap gap-4">
            <div class="flex items-center gap-4">
              <div class="size-12 rounded-xl bg-success/10 flex items-center justify-center">
                <UIcon name="i-lucide-message-circle" class="size-6 text-success" />
              </div>
              <div>
                <p class="font-semibold text-lg">
                  WhatsApp Connector
                </p>
                <div class="flex items-center gap-2 mt-0.5">
                  <UChip :color="getStatusColor" standalone size="sm" />
                  <span class="text-sm text-muted">{{ statusText }}</span>
                </div>
              </div>
            </div>

            <ActionButton
              v-if="waStatus.status !== 'ready' && waStatus.status !== 'authenticated'"
              :label="waStatus.status === 'qr' ? 'View QR Code' : 'Connect WhatsApp'"
              icon="i-lucide-qr-code"
              @click="showQR = true"
            />
          </div>
        </UCard>

        <!-- WhatsApp Group Selector & Scan -->
        <UCard>
          <div class="space-y-4">
            <div class="flex items-center gap-4">
              <div class="size-12 rounded-xl bg-success/10 flex items-center justify-center">
                <UIcon name="i-lucide-users" class="size-6 text-success" />
              </div>
              <div>
                <p class="font-semibold text-lg">
                  WhatsApp Groups
                </p>
                <p class="text-sm text-muted">
                  Last scanned: {{ formatLastScanned(waLastScanned) }}
                </p>
              </div>
            </div>

            <div class="flex items-end gap-3 flex-wrap">
              <div class="flex-1 min-w-[300px]">
                <UFormField label="WhatsApp Groups to Scan">
                  <USelectMenu
                    v-model="selectedGroups"
                    :items="waGroups"
                    value-key="id"
                    label-key="name"
                    multiple
                    class="w-full"
                    placeholder="Select Groups..."
                  />
                </UFormField>
              </div>

              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="outline"
                square
                @click="fetchWAGroups"
              />

              <ActionButton
                label="Scan WhatsApp"
                icon="i-lucide-search"
                :loading="scanningWA"
                :loading-label="`Scanning… ${formatTaskProgress(waProgress)}`"
                :disabled="isWAScanDisabled"
                @click="handleWAScan"
              />
            </div>

            <UAlert
              icon="i-lucide-message-circle"
              color="info"
              variant="subtle"
              title="WhatsApp Scanner"
              description="Scans the selected WhatsApp groups for new resume PDF attachments."
            />
          </div>
        </UCard>

        <!-- ===== 3. Google Forms Scanner Section ===== -->
        <UCard>
          <div class="space-y-4">
            <div class="flex items-center justify-between flex-wrap gap-4">
              <div class="flex items-center gap-4">
                <div class="size-12 rounded-xl bg-warning/10 flex items-center justify-center">
                  <UIcon name="i-lucide-file-text" class="size-6 text-warning" />
                </div>
                <div>
                  <p class="font-semibold text-lg">
                    Google Forms Scanner
                  </p>
                  <p class="text-sm text-muted">
                    {{ googleForms.length }} form(s) available · Last scanned: {{ formatLastScanned(formsLastScanned) }}
                  </p>
                </div>
              </div>

              <ActionButton
                :label="selectedFormIds.size > 0 ? `Scan ${selectedFormIds.size} Form${selectedFormIds.size > 1 ? 's' : ''}` : 'Scan All Forms'"
                icon="i-lucide-file-search"
                :loading="scanningForms"
                :loading-label="`Scanning… ${formatTaskProgress(formsProgress)}`"
                :disabled="googleForms.length === 0"
                @click="handleFormsScan"
              />
            </div>

            <!-- Forms List with Toggle Selection -->
            <div v-if="googleForms.length > 0" class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium text-muted">
                  Select Forms to Scan
                </p>
                <p class="text-xs text-muted">
                  {{ selectedFormIds.size === 0 ? 'All forms will be scanned' : `${selectedFormIds.size} of ${googleForms.length} selected` }}
                </p>
              </div>
              <div
                v-for="form in googleForms"
                :key="form.id"
                class="flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors"
                :class="isFormSelected(form.form_id) ? 'bg-primary/5 border-primary/20' : 'bg-[var(--ui-bg-elevated)] border-[var(--ui-border)]'"
              >
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    type="button"
                    class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    :class="isFormSelected(form.form_id) ? 'bg-primary' : 'bg-[var(--ui-border)]'"
                    role="switch"
                    :aria-checked="isFormSelected(form.form_id)"
                    @click="toggleFormSelection(form.form_id)"
                  >
                    <span
                      class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                      :class="isFormSelected(form.form_id) ? 'translate-x-4' : 'translate-x-0'"
                    />
                  </button>
                  <div class="min-w-0">
                    <p class="font-medium text-sm truncate">
                      {{ form.form_title || 'Untitled Form' }}
                    </p>
                    <p class="text-xs text-muted truncate">
                      {{ form.job_role_name || 'No linked role' }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <UButton
                    icon="i-lucide-external-link"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :to="form.form_url"
                    target="_blank"
                    title="Open Form"
                  />
                  <UButton
                    icon="i-lucide-copy"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    title="Copy Form URL"
                    @click="copyToClipboard(form.form_url)"
                  />
                </div>
              </div>
            </div>

            <div v-else>
              <UAlert
                icon="i-lucide-file-question"
                color="warning"
                variant="subtle"
                title="No Forms Available"
                description="Create a Google Form from the Jobs page by clicking 'Generate Form' on any job description card."
              />
            </div>

            <UAlert
              icon="i-lucide-info"
              color="info"
              variant="subtle"
              title="Google Forms Scanner"
              description="Toggle on the forms you want to scan. If none are selected, all forms will be scanned. Forms are generated from the Jobs page."
            />
          </div>
        </UCard>
      </div>

      <!-- QR Code Modal -->
      <UModal v-model:open="showQR" title="Scan QR Code">
        <template #body>
          <div class="text-center space-y-4">
            <div v-if="waStatus.qrCodeData" class="bg-white p-4 rounded-xl inline-block">
              <img :src="waStatus.qrCodeData" alt="WhatsApp QR" class="w-[250px] h-[250px]">
            </div>
            <p class="text-sm text-muted leading-relaxed">
              Open WhatsApp on your phone, go to Linked Devices, and scan this code to connect.
            </p>
          </div>
        </template>
        <template #footer>
          <UButton
            label="Close"
            color="neutral"
            variant="outline"
            block
            @click="showQR = false"
          />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import type { WAStatus, WAGroup } from '~/types'

const { apiFetch, token } = useApi()
const toast = useToast()

// --- Email Scanner State ---
const scanningMail = ref(false)
const mailLastScanned = ref<string | null>(null)

// --- WhatsApp State ---
const scanningWA = ref(false)
const waStatus = ref<WAStatus>({ status: 'not connected', qrCodeData: null })
const waGroups = ref<WAGroup[]>([])
const selectedGroups = ref<string[]>([])
const showQR = ref(false)

let statusInterval: ReturnType<typeof setInterval> | null = null

// --- Fetch scan status ---
const fetchScanStatus = async () => {
  try {
    const status = await apiFetch<Record<string, { lastScannedAt: string | null }>>('/candidates/scan-status')
    mailLastScanned.value = status.gmail?.lastScannedAt || null
  } catch (err) {
    console.error('Error fetching scan status:', err)
  }
}

// --- Email Scanner ---
const handleMailScan = async () => {
  scanningMail.value = true
  try {
    const response = await apiFetch<{ message: string; count: number }>('/candidates/scan-mail', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` }
    })
    toast.add({ title: 'Email Scan Complete', description: `${response.count} candidate(s) found`, color: 'success' })
    await fetchScanStatus()
  } catch (err) {
    console.error('Error scanning emails:', err)
    toast.add({ title: 'Email scan failed', description: 'Check logs.', color: 'error' })
  } finally {
    scanningMail.value = false
  }
}

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
  }
}

const handleWAScan = async () => {
  scanningWA.value = true
  try {
    const response = await apiFetch<{ message: string; count: number }>('/candidates/scan', {
      method: 'POST',
      body: { whatsappGroupIds: selectedGroups.value },
      headers: { Authorization: `Bearer ${token.value}` }
    })
    toast.add({ title: 'WhatsApp Scan Complete', description: `${response.count} candidate(s) found`, color: 'success' })
  } catch (err) {
    console.error('Error scanning:', err)
    toast.add({ title: 'WhatsApp scan failed', description: 'Check logs.', color: 'error' })
  } finally {
    scanningWA.value = false
  }
}

const getStatusColor = computed(() => {
  switch (waStatus.value.status) {
    case 'ready': return 'success' as const
    case 'authenticated': return 'info' as const
    case 'qr': return 'warning' as const
    case 'error': return 'error' as const
    default: return 'neutral' as const
  }
})

const isWAScanDisabled = computed(() => {
  return scanningWA.value || (selectedGroups.value.length > 0 && waStatus.value.status !== 'ready')
})

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
                <div class="size-12 rounded-xl bg-[var(--ui-color-primary)]/10 flex items-center justify-center">
                  <UIcon name="i-lucide-mail" class="size-6 text-[var(--ui-color-primary)]" />
                </div>
                <div>
                  <p class="font-semibold text-lg">Email Scanner</p>
                  <p class="text-sm text-muted">
                    Last scanned: {{ formatLastScanned(mailLastScanned) }}
                  </p>
                </div>
              </div>

              <UButton
                :loading="scanningMail"
                :disabled="scanningMail"
                color="primary"
                size="lg"
                @click="handleMailScan"
              >
                <UIcon v-if="!scanningMail" name="i-lucide-mail-search" class="size-5" />
                {{ scanningMail ? 'Scanning Emails...' : 'Scan Emails' }}
              </UButton>
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
              <div class="size-12 rounded-xl bg-[var(--ui-color-success)]/10 flex items-center justify-center">
                <UIcon name="i-lucide-message-circle" class="size-6 text-[var(--ui-color-success)]" />
              </div>
              <div>
                <p class="font-semibold text-lg">WhatsApp Connector</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <UChip :color="getStatusColor" standalone size="sm" />
                  <span class="text-sm text-muted">Status: {{ waStatus.status }}</span>
                </div>
              </div>
            </div>

            <UButton
              v-if="waStatus.status !== 'ready' && waStatus.status !== 'authenticated'"
              color="primary"
              @click="showQR = true"
            >
              {{ waStatus.status === 'qr' ? 'View QR Code' : 'Connect WhatsApp' }}
            </UButton>
          </div>
        </UCard>

        <!-- WhatsApp Group Selector & Scan -->
        <UCard>
          <div class="space-y-4">
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

              <UButton
                :loading="scanningWA"
                :disabled="isWAScanDisabled"
                color="primary"
                size="lg"
                @click="handleWAScan"
              >
                <UIcon v-if="!scanningWA" name="i-lucide-search" class="size-5" />
                {{ scanningWA ? 'Scanning...' : 'Scan WhatsApp' }}
              </UButton>
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

        <!-- ===== 3. Google Forms Section (Placeholder) ===== -->
        <UCard>
          <div class="space-y-4">
            <div class="flex items-center justify-between flex-wrap gap-4">
              <div class="flex items-center gap-4">
                <div class="size-12 rounded-xl bg-[var(--ui-color-warning)]/10 flex items-center justify-center">
                  <UIcon name="i-lucide-file-text" class="size-6 text-[var(--ui-color-warning)]" />
                </div>
                <div>
                  <p class="font-semibold text-lg">Google Forms Scanner</p>
                  <p class="text-sm text-muted">Coming soon</p>
                </div>
              </div>

              <UButton
                color="neutral"
                variant="outline"
                size="lg"
                disabled
              >
                <UIcon name="i-lucide-file-text" class="size-5" />
                Scan Form Responses
              </UButton>
            </div>

            <UAlert
              icon="i-lucide-construction"
              color="warning"
              variant="subtle"
              title="Under Development"
              description="Google Forms integration will allow you to generate application forms and scan responses with uploaded resumes."
            />
          </div>
        </UCard>
      </div>

      <!-- QR Code Modal -->
      <UModal v-model:open="showQR" title="Scan QR Code">
        <template #body>
          <div class="text-center space-y-4">
            <div v-if="waStatus.qrCodeData" class="bg-white p-4 rounded-xl inline-block">
              <img :src="waStatus.qrCodeData" alt="WhatsApp QR" class="w-[250px] h-[250px]" />
            </div>
            <p class="text-sm text-muted leading-relaxed">
              Open WhatsApp on your phone, go to Linked Devices, and scan this code to connect.
            </p>
          </div>
        </template>
        <template #footer>
          <UButton label="Close" color="neutral" variant="outline" block @click="showQR = false" />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

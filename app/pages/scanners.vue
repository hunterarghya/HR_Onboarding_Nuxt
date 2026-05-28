<script setup lang="ts">
import type { WAStatus, WAGroup } from '~/types'

const { apiFetch, token } = useApi()
const toast = useToast()

const scanning = ref(false)
const waStatus = ref<WAStatus>({ status: 'not connected', qrCodeData: null })
const waGroups = ref<WAGroup[]>([])
const selectedGroups = ref<string[]>([])
const showQR = ref(false)

let statusInterval: ReturnType<typeof setInterval> | null = null

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

const handleScan = async () => {
  scanning.value = true
  try {
    const response = await apiFetch<{ message: string }>('/candidates/scan', {
      method: 'POST',
      body: { whatsappGroupIds: selectedGroups.value },
      headers: { Authorization: `Bearer ${token.value}` }
    })
    toast.add({ title: 'Scan Complete', description: response.message, color: 'success' })
  } catch (err) {
    console.error('Error scanning:', err)
    toast.add({ title: 'Scanning failed', description: 'Check logs.', color: 'error' })
  } finally {
    scanning.value = false
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

const toggleGroup = (groupId: string) => {
  const idx = selectedGroups.value.indexOf(groupId)
  if (idx >= 0) {
    selectedGroups.value.splice(idx, 1)
  } else {
    selectedGroups.value.push(groupId)
  }
}

const isScanDisabled = computed(() => {
  return scanning.value || (selectedGroups.value.length > 0 && waStatus.value.status !== 'ready')
})

watch(() => waStatus.value.status, (status) => {
  if (status === 'ready') {
    fetchWAGroups()
  }
})

onMounted(() => {
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
        <!-- WhatsApp Connection Section -->
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

        <!-- Group Selector & Scan -->
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
                :loading="scanning"
                :disabled="isScanDisabled"
                color="primary"
                size="lg"
                @click="handleScan"
              >
                <UIcon v-if="!scanning" name="i-lucide-search" class="size-5" />
                {{ scanning ? 'Scanning...' : 'Start Full Scan' }}
              </UButton>
            </div>

            <UAlert
              icon="i-lucide-mail"
              color="info"
              variant="subtle"
              title="Full Scan"
              description="This will process unread emails from Gmail and check the selected WhatsApp groups for new resumes."
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

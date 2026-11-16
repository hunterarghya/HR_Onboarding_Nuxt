<script setup lang="ts">
// Settings → AI model: plug in your own Groq or Gemini API key, pick which AI your scans and calendar
// syncs use, and swap the key when it runs out. Keys are stored encrypted and never shown again.

type KeyProvider = 'groq' | 'gemini'
interface ProviderInfo {
  provider: KeyProvider
  label: string
  keyPage: string
  defaultModel: string
  key: { hint: string, model: string, updatedAt: string } | null
}
interface AiSettings {
  active: 'server' | KeyProvider
  server: { provider: string, label: string, model: string }
  providers: ProviderInfo[]
}
interface TestResult { ok: boolean, label: string, model: string, ms: number, reply: string | null, error?: string }

const { apiFetch } = useApi()
const toast = useToast()

const settings = ref<AiSettings | null>(null)
const loading = ref(false)

const load = async () => {
  loading.value = true
  try {
    settings.value = await apiFetch<AiSettings>('/settings/ai')
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** The error message the server sent back (statusMessage), for toasts */
const reason = (err: unknown) => (err as { data?: { statusMessage?: string } })?.data?.statusMessage || (err as Error).message

// ---- plug in / replace a key
const form = reactive({ provider: 'gemini' as KeyProvider, apiKey: '', model: '' })
const models = ref<string[]>([])
const saving = ref(false)
const loadingModels = ref(false)

const editing = computed(() => settings.value?.providers.find(p => p.provider === form.provider))

const startEdit = (p: ProviderInfo) => {
  form.provider = p.provider
  form.apiKey = ''
  form.model = p.key?.model ?? p.defaultModel
  models.value = []
}
watch(() => form.provider, () => {
  if (editing.value) startEdit(editing.value)
})
watch(settings, (s) => {
  if (s && !form.model) startEdit(s.providers.find(p => p.provider === form.provider)!)
})

const loadModels = async () => {
  loadingModels.value = true
  try {
    const res = await apiFetch<{ models: string[] }>(`/settings/ai/models/${form.provider}`, {
      method: 'POST',
      body: form.apiKey ? { apiKey: form.apiKey } : {}
    })
    models.value = res.models
    if (!res.models.includes(form.model) && res.models.length) toast.add({ title: `${res.models.length} models available`, color: 'info' })
  } catch (err) {
    toast.add({ title: 'Couldn\'t list the models', description: reason(err), color: 'error' })
  } finally {
    loadingModels.value = false
  }
}

const save = async () => {
  saving.value = true
  try {
    const body: { apiKey?: string, model?: string } = { model: form.model.trim() || undefined }
    if (form.apiKey.trim()) body.apiKey = form.apiKey.trim()
    settings.value = await apiFetch<AiSettings>(`/settings/ai/keys/${form.provider}`, { method: 'PUT', body })
    toast.add({
      title: body.apiKey ? `${editing.value?.label} key saved and in use` : 'Model updated',
      description: 'The key was checked with the provider first.',
      color: 'success'
    })
    form.apiKey = ''
  } catch (err) {
    toast.add({ title: 'Not saved', description: reason(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

// ---- choose / remove
const choose = async (provider: AiSettings['active']) => {
  try {
    settings.value = await apiFetch<AiSettings>('/settings/ai/active', { method: 'PUT', body: { provider } })
    testResult.value = null
  } catch (err) {
    toast.add({ title: 'Couldn\'t switch', description: reason(err), color: 'error' })
  }
}

const remove = async (p: ProviderInfo) => {
  if (!confirm(`Remove your ${p.label} key (${p.key?.hint})?`)) return
  settings.value = await apiFetch<AiSettings>(`/settings/ai/keys/${p.provider}`, { method: 'DELETE' })
  toast.add({ title: `${p.label} key removed`, color: 'neutral' })
}

// ---- test the AI in use
const testing = ref(false)
const testResult = ref<TestResult | null>(null)
const test = async () => {
  testing.value = true
  try {
    testResult.value = await apiFetch<TestResult>('/settings/ai/test', { method: 'POST' })
  } finally {
    testing.value = false
  }
}

const activeLabel = computed(() => {
  const s = settings.value
  if (!s) return ''
  if (s.active === 'server') return `Server default: ${s.server.label} (${s.server.model})`
  const p = s.providers.find(x => x.provider === s.active)!
  return `Your ${p.label} key ${p.key?.hint} · ${p.key?.model}`
})
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="settings" class="space-y-6 max-w-3xl">
        <!-- what's in use -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p class="font-semibold text-lg">
                  AI model
                </p>
                <p class="text-sm text-muted">
                  Decides which emails are applications and reads interviews from your calendar.
                </p>
              </div>
              <UButton
                label="Test"
                icon="i-lucide-activity"
                color="neutral"
                variant="outline"
                :loading="testing"
                @click="test"
              />
            </div>
          </template>

          <p class="text-sm">
            In use: <span class="font-medium">{{ activeLabel }}</span>
          </p>
          <UAlert
            v-if="testResult"
            class="mt-3"
            :color="testResult.ok ? 'success' : 'error'"
            variant="subtle"
            :title="testResult.ok ? `${testResult.label} answered in ${(testResult.ms / 1000).toFixed(1)} s` : `${testResult.label} didn't answer`"
            :description="testResult.ok ? `Model ${testResult.model}` : testResult.error"
          />

          <div class="mt-4 grid gap-3">
            <!-- server default -->
            <div class="flex items-center justify-between gap-3 rounded-lg border border-default p-3">
              <div>
                <p class="font-medium">
                  Server default
                </p>
                <p class="text-sm text-muted">
                  {{ settings.server.label }} · {{ settings.server.model }} (set by whoever runs this app)
                </p>
              </div>
              <UBadge v-if="settings.active === 'server'" color="success" variant="subtle">
                In use
              </UBadge>
              <UButton
                v-else
                label="Use this"
                size="sm"
                variant="soft"
                @click="choose('server')"
              />
            </div>

            <!-- the HR's own keys -->
            <div v-for="p in settings.providers" :key="p.provider" class="flex items-center justify-between gap-3 rounded-lg border border-default p-3 flex-wrap">
              <div>
                <p class="font-medium">
                  Your {{ p.label }} key
                </p>
                <p v-if="p.key" class="text-sm text-muted">
                  {{ p.key.hint }} · {{ p.key.model }} · added {{ new Date(p.key.updatedAt).toLocaleDateString() }}
                </p>
                <p v-else class="text-sm text-muted">
                  Not added. <a
                    :href="p.keyPage"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="underline"
                  >Get a {{ p.label }} key</a>
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UBadge v-if="settings.active === p.provider" color="success" variant="subtle">
                  In use
                </UBadge>
                <UButton
                  v-else-if="p.key"
                  label="Use this"
                  size="sm"
                  variant="soft"
                  @click="choose(p.provider)"
                />
                <UButton
                  :label="p.key ? 'Replace key' : 'Add key'"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  @click="startEdit(p)"
                />
                <UButton
                  v-if="p.key"
                  icon="i-lucide-trash-2"
                  size="sm"
                  color="error"
                  variant="ghost"
                  :aria-label="`Remove ${p.label} key`"
                  @click="remove(p)"
                />
              </div>
            </div>
          </div>
        </UCard>

        <!-- plug in / replace -->
        <UCard>
          <template #header>
            <p class="font-semibold">
              {{ editing?.key ? 'Replace' : 'Add' }} your {{ editing?.label }} key
            </p>
            <p class="text-sm text-muted">
              When a key reaches its limit, paste a new one here: the next scan uses it. The key is checked with {{ editing?.label }} before it's saved.
            </p>
          </template>

          <form class="space-y-4" @submit.prevent="save">
            <UFormField label="Provider">
              <USelect v-model="form.provider" :items="settings.providers.map(p => ({ label: p.label, value: p.provider }))" class="w-48" />
            </UFormField>

            <UFormField :label="editing?.key ? 'New API key (leave empty to only change the model)' : 'API key'">
              <UInput
                v-model="form.apiKey"
                type="password"
                autocomplete="off"
                :placeholder="editing?.key ? `current key ${editing.key.hint}` : 'paste the key'"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Model">
              <div class="flex gap-2">
                <UInput
                  v-model="form.model"
                  :placeholder="editing?.defaultModel"
                  class="flex-1"
                  list="model-options"
                />
                <datalist id="model-options">
                  <option v-for="m in models" :key="m" :value="m" />
                </datalist>
                <UButton
                  label="Load models"
                  color="neutral"
                  variant="outline"
                  :loading="loadingModels"
                  :disabled="!form.apiKey && !editing?.key"
                  @click="loadModels"
                />
              </div>
            </UFormField>

            <UButton
              type="submit"
              :label="form.apiKey ? 'Save and use this key' : 'Save model'"
              :loading="saving"
              :disabled="!form.apiKey && !editing?.key"
            />
          </form>
        </UCard>
      </div>
      <p v-else-if="loading" class="text-sm text-muted">
        Loading…
      </p>
    </template>
  </UDashboardPanel>
</template>

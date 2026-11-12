<script setup lang="ts">
// Asks the HR for the company name their emails use. Opens by itself until one is set, and from
// the user menu to change it later.
const sessionUser = useSessionUser()
const open = useCompanyNameDialog()
const { apiFetch } = useApi()
const toast = useToast()

const companyName = ref('')
const saving = ref(false)

watch(sessionUser, (user) => {
  if (user && !user.company_name) open.value = true
}, { immediate: true })

watch(open, (isOpen) => {
  if (isOpen) companyName.value = sessionUser.value?.company_name ?? ''
}, { immediate: true })

const save = async () => {
  if (!companyName.value.trim()) return
  saving.value = true
  try {
    sessionUser.value = await apiFetch<SessionUser>('/auth/me', { method: 'PATCH', body: { company_name: companyName.value } })
    open.value = false
    toast.add({ title: 'Company name saved', color: 'success' })
  } catch {
    toast.add({ title: 'Could not save the company name', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Your company name">
    <template #body>
      <p class="text-sm text-muted mb-4">
        Emails to candidates use it, for example "Interview Invitation at <strong>your company</strong>". You can change it later from the user menu.
      </p>
      <UFormField label="Company name">
        <UInput
          v-model="companyName"
          placeholder="Company name"
          class="w-full"
          @keyup.enter="save"
        />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex gap-3 w-full">
        <UButton
          label="Save"
          color="primary"
          :loading="saving"
          :disabled="!companyName.trim()"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>

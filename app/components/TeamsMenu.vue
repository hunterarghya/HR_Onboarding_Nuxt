<script setup lang="ts">
// Sidebar header: the signed-in HR's own company (each HR enters theirs). Clicking it changes the name.

defineProps<{
  collapsed?: boolean
}>()

const sessionUser = useSessionUser()
const companyNameDialog = useCompanyNameDialog()

const label = computed(() => sessionUser.value?.company_name || 'HR Onboarding')
</script>

<template>
  <UButton
    :label="collapsed ? undefined : label"
    icon="i-lucide-building-2"
    color="neutral"
    variant="ghost"
    block
    :square="collapsed"
    :class="[!collapsed && 'py-2']"
    :title="sessionUser?.company_name ? 'Change company name' : 'Set company name'"
    @click="companyNameDialog = true"
  />
</template>

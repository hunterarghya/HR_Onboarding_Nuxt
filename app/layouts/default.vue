<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()

useDashboard()

const open = ref(false)

const links = [[{
  label: 'Jobs',
  icon: 'i-lucide-briefcase',
  to: '/',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Scanners',
  icon: 'i-lucide-zap',
  to: '/scanners',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Candidates',
  icon: 'i-lucide-users',
  to: '/candidates',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Templates',
  icon: 'i-lucide-file-text',
  to: '/templates',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Interviews',
  icon: 'i-lucide-calendar-check',
  to: '/interviews',
  onSelect: () => {
    open.value = false
  }
}]] satisfies NavigationMenuItem[][]

const groups = computed(() => [{
  id: 'links',
  label: 'Go to',
  items: links.flat()
}])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <TeamsMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />
  </UDashboardGroup>
</template>

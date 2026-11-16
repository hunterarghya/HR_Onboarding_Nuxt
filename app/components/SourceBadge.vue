<script setup lang="ts">
// Where a candidate came from, with its own icon and colour (the stored values are Gmail, WhatsApp, GoogleForms).

const props = defineProps<{ source: string | null | undefined }>()

const SOURCES: Record<string, { label: string, icon: string, color: string }> = {
  Gmail: { label: 'Gmail', icon: 'i-lucide-mail', color: 'text-error' },
  WhatsApp: { label: 'WhatsApp', icon: 'i-lucide-message-circle', color: 'text-success' },
  GoogleForms: { label: 'Google Forms', icon: 'i-lucide-file-text', color: 'text-warning' }
}

const shown = computed(() => (props.source && SOURCES[props.source]) || { label: props.source || 'Unknown', icon: 'i-lucide-inbox', color: 'text-muted' })
</script>

<template>
  <div class="flex items-center gap-1.5 text-xs whitespace-nowrap">
    <UIcon :name="shown.icon" class="size-4 shrink-0" :class="shown.color" />
    <span>{{ shown.label }}</span>
  </div>
</template>

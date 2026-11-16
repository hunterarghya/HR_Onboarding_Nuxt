<script setup lang="ts">
// The main action of a card or page (Scan Emails, Create Event, Send Offer Letters…): one size and a
// minimum width everywhere, so actions line up and don't jump around when their label changes.
// While `loading`, it shows `loadingLabel` (e.g. "Scanning… 3 / 10") and can't be clicked again.

withDefaults(defineProps<{
  label: string
  icon?: string
  loading?: boolean
  loadingLabel?: string
  disabled?: boolean
  color?: 'primary' | 'neutral' | 'error'
  variant?: 'solid' | 'outline' | 'soft'
  type?: 'button' | 'submit'
  /** full width (e.g. under a calendar, or on a narrow column) */
  block?: boolean
}>(), {
  icon: undefined,
  loading: false,
  loadingLabel: undefined,
  disabled: false,
  color: 'primary',
  variant: 'solid',
  type: 'button',
  block: false
})

defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <UButton
    :type="type"
    :color="color"
    :variant="variant"
    size="md"
    :icon="loading ? undefined : icon"
    :loading="loading"
    :disabled="disabled || loading"
    :block="block"
    class="justify-center"
    :class="block ? '' : 'min-w-44'"
    @click="$emit('click', $event)"
  >
    {{ loading && loadingLabel ? loadingLabel : label }}
  </UButton>
</template>

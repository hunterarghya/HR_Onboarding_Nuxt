<script setup lang="ts">
definePageMeta({
  layout: false // Don't use the dashboard layout for the login page
})

const loading = ref(false)
const error = ref('')

const handleLogin = async () => {
  loading.value = true
  error.value = ''
  try {
    const data = await $fetch<{ url: string }>(`/api/auth/google`)
    if (data && data.url) {
      window.location.href = data.url
    } else {
      error.value = 'Invalid response from authentication server.'
      loading.value = false
    }
  } catch (err) {
    console.error('Error connecting to auth server:', err)
    error.value = 'Failed to connect to the authentication server.'
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-[var(--ui-bg)] p-4">
    <UCard class="max-w-sm w-full text-center" :ui="{ body: 'p-8 space-y-6' }">
      
      <!-- Header -->
      <div>
        <div class="mx-auto size-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
          <UIcon name="i-lucide-users" class="size-6 text-primary" />
        </div>
        <h1 class="text-2xl font-bold text-foreground">Hunter HR</h1>
        <p class="text-sm text-muted mt-2">Sign in to manage jobs, candidates, and interviews.</p>
      </div>

      <!-- Error State -->
      <div v-if="error" class="p-3 bg-error/10 text-error rounded-lg text-sm">
        {{ error }}
      </div>

      <!-- Login Button -->
      <UButton
        size="lg"
        color="neutral"
        variant="outline"
        block
        :loading="loading"
        @click="handleLogin"
        class="flex items-center justify-center gap-2"
      >
        <UIcon name="i-simple-icons-google" class="size-5" />
        Continue with Google
      </UButton>
      
      <p class="text-xs text-muted">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
    </UCard>
  </div>
</template>

import { createSharedComposable } from '@vueuse/core'

const _useDashboard = () => {
  const router = useRouter()

  defineShortcuts({
    'g-h': () => router.push('/'),
    'g-s': () => router.push('/scanners'),
    'g-c': () => router.push('/candidates'),
    'g-t': () => router.push('/templates'),
    'g-i': () => router.push('/interviews')
  })

  return {}
}

export const useDashboard = createSharedComposable(_useDashboard)

export const useApi = () => {
  const token = useCookie('hr-token')

  const apiFetch = <T>(url: string, opts: Record<string, any> = {}) => {
    return $fetch<T>(`/api${url}`, {
      ...opts,
      headers: {
        ...opts.headers,
        ...(token.value ? { Authorization: `Bearer ${token.value}` } : {})
      },
      onResponseError({ response }) {
        // Every /api route needs a session; an expired or invalid one means signing in again
        if (response.status === 401) {
          token.value = null
          navigateTo('/login')
        }
      }
    })
  }

  return { apiFetch, token }
}

export const useApi = () => {
  // Sends the session cookie automatically; during server-side rendering it forwards the browser's cookie
  const requestFetch = useRequestFetch()
  const sessionUser = useSessionUser()

  const apiFetch = <T>(url: string, opts: Record<string, any> = {}) => {
    return requestFetch<T>(`/api${url}`, {
      ...opts,
      onResponseError({ response }) {
        // Every /api route needs a session; an expired or invalid one means signing in again
        if (response.status === 401) {
          sessionUser.value = null
          navigateTo('/login')
        }
      }
    })
  }

  return { apiFetch }
}

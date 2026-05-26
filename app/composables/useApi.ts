export const useApi = () => {
  const token = useCookie('hr-token')

  const apiFetch = <T>(url: string, opts: Record<string, any> = {}) => {
    return $fetch<T>(`/api${url}`, {
      ...opts,
      headers: {
        ...opts.headers,
        ...(token.value ? { Authorization: `Bearer ${token.value}` } : {})
      }
    })
  }

  return { apiFetch, token }
}

export default defineNuxtRouteMiddleware(async (to) => {
  // Allow the /login page to render
  if (to.path === '/login') {
    return
  }

  const sessionUser = useSessionUser()
  if (sessionUser.value) {
    return
  }

  // The httpOnly session cookie is invisible to page scripts, so ask the server who is signed in
  try {
    sessionUser.value = await useRequestFetch()<SessionUser>('/api/auth/me')
  } catch {
    return navigateTo('/login')
  }
})

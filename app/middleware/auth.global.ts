export default defineNuxtRouteMiddleware(async (to) => {
  const token = useCookie('hr-token')
  const config = useRuntimeConfig()

  // Check if a token was passed via URL query (Google OAuth callback)
  if (import.meta.client && to.query.token) {
    token.value = to.query.token as string
    
    // The backend redirects to /login?token=..., so we should send them to the home page
    const targetPath = to.path === '/login' ? '/' : to.path
    
    // Remove token from URL
    return navigateTo(targetPath, { replace: true })
  }

  // Allow the /login page to render
  if (to.path === '/login') {
    return
  }

  // If no token, redirect to our local /login page
  if (!token.value) {
    return navigateTo('/login')
  }
})

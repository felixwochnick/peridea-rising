export default defineNuxtRouteMiddleware(() => {
  // the session is loaded with the page (nuxt-auth-utils), solo players just click "Solo spielen"
  const { loggedIn } = useAuth()
  if (!loggedIn.value) return navigateTo('/login')
})

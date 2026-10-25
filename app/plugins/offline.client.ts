// Offline the service worker serves the client-only app shell (nuxt.config: pwa) and the session can't be loaded.
// Instead of the login the player gets a local guest session: solo against bots and AI, like an anonymous login.
// Back online it is replaced by the session still in the cookie, or by a real guest session.
const RETRY_MS = 30_000

export default defineNuxtPlugin(async (nuxtApp) => {
  const { online } = useConnectivity()
  const { loggedIn, fetch: fetchSession } = useUserSession()
  const { loginOffline } = useAuth()
  const offlineGuest = useState('offline-guest', () => false)

  /** navigator.onLine is also true in a network without internet, so ask the server. */
  async function reachable() {
    if (!navigator.onLine) return false
    return await fetch('/api/_auth/session', { headers: { accept: 'application/json' }, cache: 'no-store' })
      .then(() => true, () => false)
  }

  let retry: ReturnType<typeof setInterval> | undefined
  async function check() {
    online.value = await reachable()
    if (!online.value) {
      if (!loggedIn.value) loginOffline()
      retry ??= setInterval(check, RETRY_MS)
      return
    }
    clearInterval(retry)
    retry = undefined
    if (offlineGuest.value) {
      offlineGuest.value = false
      await fetchSession()
      if (!loggedIn.value) await $fetch('/api/auth/anonymous', { method: 'POST' }).then(fetchSession, () => {})
    }
  }

  // a server-rendered page proves the server is there
  if (nuxtApp.payload.serverRendered && navigator.onLine) online.value = true
  else await check()

  window.addEventListener('online', check)
  window.addEventListener('offline', () => { online.value = false })
})

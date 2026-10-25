/**
 * Login on top of nuxt-auth-utils (session in a sealed cookie):
 * solo players get an anonymous guest session, multiplayer needs an Authentik (SSO) account.
 */
export function useAuth() {
  const { user, loggedIn, session, fetch, clear } = useUserSession()
  const { offline } = useConnectivity()

  /** Load the session (also works during SSR, the cookie is sent along). */
  async function init() {
    await fetch()
  }

  /** Solo: guest session, nothing to sign up for (offline only in this browser, see plugins/offline.client.ts). */
  async function loginAnonymously() {
    if (offline.value) return loginOffline()
    await $fetch('/api/auth/anonymous', { method: 'POST' })
    await fetch()
  }

  /** Local guest while the server can't be reached: solo against bots and AI. */
  function loginOffline() {
    session.value = { id: 'offline', user: { id: 'offline', name: 'Pilot', provider: 'anonymous' } }
    useState('offline-guest').value = true
  }

  /** Multiplayer: leaves the app for Authentik, which sends the player back to /game-modes. */
  async function loginWithSso() {
    await navigateTo('/auth/authentik', { external: true })
  }

  async function logout() {
    // offline the cookie can't be cleared on the server: forget the session here
    await clear().catch(() => { session.value = null })
  }

  const isAnonymous = computed(() => user.value?.provider === 'anonymous')
  /** Multiplayer needs a real (SSO) account, so other players can see who they play with – and a connection. */
  const canMultiplayer = computed(() => user.value?.provider === 'authentik' && !offline.value)

  return { user, loggedIn, offline, isAnonymous, canMultiplayer, init, loginAnonymously, loginOffline, loginWithSso, logout }
}

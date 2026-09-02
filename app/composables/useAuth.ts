import type { Models } from 'appwrite'

const user = ref<Models.User<Models.Preferences> | null>(null)

export function useAuth() {
  const { $appwrite } = useNuxtApp()

  async function init() {
    try {
      user.value = await $appwrite.account.get()
    }
    catch {
      user.value = null
    }
  }

  async function loginAnonymously() {
    await $appwrite.account.createAnonymousSession()
    user.value = await $appwrite.account.get()
  }

  async function logout() {
    await $appwrite.account.deleteSession('current')
    user.value = null
  }

  return { user: readonly(user), init, loginAnonymously, logout }
}

// Settings kept in localStorage (works offline) and, for SSO accounts, in the database (server/api/settings).
// Last write wins: every local change gets a timestamp, and on sync the newer copy is kept on both sides.
// Changes made offline stay marked as pending and are sent once the connection is back.
import type { Ref } from 'vue'

interface SyncMeta {
  /** Time of the copy in this browser (ms), 0 = defaults / never changed. */
  updatedAt: number
  /** Changed here, not on the server yet. */
  pending: boolean
  /** SSO account this browser's copy was last synced with. */
  userId: string | null
}

interface StoredSettings {
  value: unknown
  updatedAt: number
}

export interface SyncedSettingsOptions<T> {
  /** Fills in defaults and repairs old / foreign values (localStorage and server copies). */
  normalize: (stored: Partial<T>) => T
  /** The part that goes to the server (e.g. without secrets). */
  toRemote?: (settings: T) => object
  /** Server copy → settings, may keep local-only fields from `local`. */
  fromRemote?: (remote: Partial<T>, local: T) => T
}

export function useSyncedSettings<T extends object>(key: string, defaults: () => T, options: SyncedSettingsOptions<T>) {
  const settings = useState<T>(key, defaults)
  const started = useState(`${key}-loaded`, () => false)

  if (import.meta.client && !started.value) {
    started.value = true
    // detached scope: keeps persisting even after the calling component unmounts
    effectScope(true).run(() => startSync(key, settings, options))
  }

  return settings
}

function readLocal<V>(key: string): V | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as V : null
  }
  catch { return null }
}

function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) }
  catch { /* storage unavailable */ }
}

function startSync<T extends object>(key: string, settings: Ref<T>, options: SyncedSettingsOptions<T>) {
  const { normalize, toRemote = s => s, fromRemote = remote => normalize(remote) } = options
  const metaKey = `${key}-sync`
  const { user } = useUserSession()
  const account = () => user.value?.provider === 'authentik' ? user.value.id : null

  const stored = readLocal<Partial<T>>(key)
  if (stored) settings.value = normalize(stored)
  let meta: SyncMeta = { updatedAt: 0, pending: false, userId: null, ...readLocal<SyncMeta>(metaKey) }
  /** JSON of the remote part as the server has it, to tell own changes from applied server copies. */
  let remoteJson: string | null = null
  const remoteOf = (s: T) => JSON.stringify(toRemote(s))

  function setMeta(next: Partial<SyncMeta>) {
    meta = { ...meta, ...next }
    writeLocal(metaKey, meta)
  }

  function applyRemote(remote: StoredSettings) {
    const next = fromRemote(remote.value as Partial<T>, settings.value)
    remoteJson = remoteOf(next)
    settings.value = next
    setMeta({ updatedAt: remote.updatedAt, pending: false })
  }

  // network calls one after another, so a sync never overtakes a push
  let queue = Promise.resolve()
  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task).catch(() => { /* offline or no database: stays pending */ })
  }

  async function push() {
    if (!account() || !meta.pending) return
    const at = meta.updatedAt
    const value = toRemote(settings.value)
    const sent = JSON.stringify(value)
    const result = await $fetch<StoredSettings>(`/api/settings/${key}`, { method: 'PUT', body: { value, updatedAt: at } })
    // changed again meanwhile: the next push sends that
    if (meta.updatedAt !== at) return
    if (JSON.stringify(result.value) !== sent) applyRemote(result) // the server kept a newer copy
    else {
      remoteJson = sent
      setMeta({ updatedAt: result.updatedAt, pending: false })
    }
  }

  async function pull() {
    const id = account()
    if (!id) return
    // a copy synced with another account must not overwrite this one's settings
    if (meta.userId !== id) setMeta({ userId: id, updatedAt: meta.userId ? 0 : meta.updatedAt })
    const remote = await $fetch<StoredSettings | null>(`/api/settings/${key}`)
    if (remote && remote.updatedAt >= meta.updatedAt) applyRemote(remote)
    else {
      if (!remote) setMeta({ pending: true })
      await push()
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(settings, (s) => {
    writeLocal(key, s)
    const json = remoteOf(s)
    // a server copy just applied, or only local-only fields changed
    if (json === remoteJson) return
    remoteJson = null
    setMeta({ updatedAt: Date.now(), pending: true })
    clearTimeout(timer)
    timer = setTimeout(() => enqueue(push), 1000)
  }, { deep: true })

  watch(account, id => id && enqueue(pull), { immediate: true })
  window.addEventListener('online', () => enqueue(pull))
  // changes from other devices
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') enqueue(pull)
  })
}

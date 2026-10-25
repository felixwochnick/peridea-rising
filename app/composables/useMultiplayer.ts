import { Client, type Room } from '@colyseus/sdk'

// One connection per browser tab (client only).
let sdk: Client | null = null
let room: Room | null = null
const RECONNECT_KEY = 'mp-reconnect'

export type MultiplayerStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting'

/**
 * Multiplayer session on the Colyseus server (multiplayer/GalacticRoom.ts): create or join a lobby with
 * its code, receive the lobby and the game state, send actions. Only for SSO accounts.
 */
export function useMultiplayer() {
  const nuxtApp = useNuxtApp()
  const config = useRuntimeConfig()
  const lobby = useState<LobbyView | null>('mp-lobby', () => null)
  const status = useState<MultiplayerStatus>('mp-status', () => 'idle')

  /** In a lobby or game on the server. */
  const active = computed(() => !!lobby.value)
  /** The game runs on the server: actions are sent there. */
  const inGame = computed(() => lobby.value?.phase === 'game')
  const isHost = computed(() => lobby.value?.you === 0)
  const seatId = computed(() => (lobby.value ? seatPlayerId(lobby.value.you) : null))

  const inContext = (fn: () => void) => nuxtApp.runWithContext(fn)
  const toast = (title: string, color: 'error' | 'warning' | 'info' = 'error') =>
    inContext(() => useToast().add({ title, color, icon: 'i-lucide-wifi-off' }))

  /** Configured URL, or the app's own address (http → ws, https → wss) where serve.ts mounts the server. */
  function endpoint() {
    if (config.public.multiplayerUrl) return config.public.multiplayerUrl
    return import.meta.dev ? 'ws://localhost:2567' : `${location.origin}${MULTIPLAYER_PATH}`
  }

  async function connect() {
    sdk ??= new Client(endpoint())
    const { token } = await $fetch<{ token: string }>('/api/auth/colyseus-token')
    sdk.auth.token = token
    return sdk
  }

  function reset() {
    room = null
    lobby.value = null
    status.value = 'idle'
    try { sessionStorage.removeItem(RECONNECT_KEY) }
    catch { /* storage unavailable */ }
  }

  function attach(r: Room) {
    room = r
    status.value = 'connected'
    try { sessionStorage.setItem(RECONNECT_KEY, r.reconnectionToken) }
    catch { /* storage unavailable */ }
    r.onMessage('lobby', (view: LobbyView) => inContext(() => { lobby.value = view }))
    r.onMessage('state', (changed: Record<string, unknown>) => inContext(() => {
      for (const [key, value] of Object.entries(changed)) useState(key).value = value
    }))
    r.onMessage('notice', (n: Notice) => inContext(() => {
      const notices = useState<GameNotice[]>('gc-notices', () => [])
      notices.value = [...notices.value, { id: Date.now() + Math.random(), ...n }]
    }))
    r.onMessage('error', (message: string) => toast(message, 'warning'))
    r.onMessage('closed', (message: string) => toast(message, 'info'))
    r.onDrop(() => { status.value = 'reconnecting' })
    r.onReconnect(() => {
      status.value = 'connected'
      try { sessionStorage.setItem(RECONNECT_KEY, r.reconnectionToken) }
      catch { /* storage unavailable */ }
    })
    r.onLeave((code: number) => {
      if (room !== r) return
      const wasGame = inGame.value
      reset()
      // 4000 = left on purpose (own leave or closed lobby)
      if (code !== 4000 && code !== 1000) toast('Verbindung zum Multiplayer-Server verloren.')
      if (wasGame) inContext(() => navigateTo('/game-modes/galactic-colonization'))
    })
  }

  async function run<T>(what: () => Promise<T>) {
    status.value = 'connecting'
    try {
      return await what()
    }
    catch (e) {
      status.value = room ? 'connected' : 'idle'
      throw e
    }
  }

  /** Opens a lobby with `code` (the host takes seat 1). */
  const create = (code: string, cfg: LobbyConfig) => run(async () => {
    const c = await connect()
    attach(await c.create(MULTIPLAYER_ROOM, { code, config: cfg }))
  })

  const join = (code: string) => run(async () => {
    const c = await connect()
    attach(await c.joinById(code.trim().toUpperCase()))
  })

  /** After a page reload: back into the running lobby / game. */
  async function resume() {
    if (room || status.value !== 'idle') return !!room
    let token: string | null = null
    try { token = sessionStorage.getItem(RECONNECT_KEY) }
    catch { /* storage unavailable */ }
    if (!token) return false
    try {
      await run(async () => {
        sdk ??= new Client(config.public.multiplayerUrl)
        attach(await sdk.reconnect(token!))
      })
      return true
    }
    catch {
      reset()
      return false
    }
  }

  function send(type: string, payload?: unknown) {
    room?.send(type, payload)
  }

  async function leave() {
    const r = room
    reset()
    await r?.leave(true)
  }

  return { lobby, status, active, inGame, isHost, seatId, create, join, resume, send, leave }
}

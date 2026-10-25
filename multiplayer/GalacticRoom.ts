// One multiplayer game: first a lobby (the host configures the seats, players join with the lobby code),
// then the game itself. The rules run here (shared/utils/game.ts); clients get the state – with the
// other players' hidden cards masked – and send actions, which are checked against the rules.
import { type Client, Room, ServerError } from '@colyseus/core'
import { effectScope, ref, watch, type Ref } from 'vue'
import { createBot } from '../shared/utils/bot'
import { createGame, emptyHand, GAME_STATE_KEYS, handTotal, renderNotice, type GalacticGame, type Hand, type NoticeSource, type ProgressChoice } from '../shared/utils/game'
import { driveGame } from '../shared/utils/gameDriver'
import { LOBBY_CODE, newGameConfig, sanitizeLobbyConfig, seatPlayerId, type LobbyConfig, type LobbySeat, type LobbyView } from '../shared/utils/lobby'
import type { CardId, ImprovementTrack, ResourceId } from '../shared/utils/resources'
import type { DevCard } from '../shared/utils/devCards'
import { type PlayerAuth, verifyPlayerToken } from './auth'
import { localRoll } from '../shared/utils/dice'
import { rollDrand } from './dice'

/** MULTIPLAYER_DICE=local: local randomness instead of drand (offline development). */
const LOCAL_DICE = process.env.MULTIPLAYER_DICE === 'local'
/** Seconds a dropped player may come back (afterwards a bot takes over their seat). */
const RECONNECT_LOBBY = 30
const RECONNECT_GAME = 180

type ActionArgs = unknown[]
/** Client actions: run as the sending player, every rule is checked by the engine. */
const ACTIONS: Record<string, (g: GalacticGame, pid: string, a: ActionArgs) => unknown> = {
  build: (g, pid, [kind, site]) => (kind === 'route' || kind === 'outpost' || kind === 'base' || kind === 'wall' || kind === 'knight') && typeof site === 'string' && g.buildAs(pid, kind, site),
  buyActionCard: (g, pid) => g.buyActionCard(pid),
  rollDice: (g, pid) => g.activePlayer.value.id === pid && g.rollDice(),
  endTurn: (g, pid) => g.activePlayer.value.id === pid && g.endTurn(),
  chooseGold: (g, pid, [res]) => g.chooseGold(pid, res as ResourceId),
  discardCards: (g, pid, [selection]) => g.discardCards(pid, (selection ?? {}) as Partial<Hand>),
  movePirates: (g, pid, [tile]) => g.pirates.value?.roller === pid && typeof tile === 'number' && g.movePirates(tile),
  steal: (g, pid, [victim]) => {
    const p = g.pirates.value
    return p?.phase === 'steal' && p.roller === pid && p.victims.includes(victim as string) && g.steal(victim as string)
  },
  bankTrade: (g, pid, [give, want]) => g.bankTrade(pid, give as CardId, want as CardId),
  offerTrade: (g, pid, [give, want]) => g.offerTrade(pid, (give ?? {}) as Partial<Hand>, (want ?? {}) as Partial<Hand>),
  respondTrade: (g, pid, [accept]) => g.respondTrade(pid, !!accept),
  counterTrade: (g, pid, [cards]) => g.counterTrade(pid, (cards ?? {}) as Partial<Hand>),
  completeTrade: (g, pid, [partner]) => g.trade.value?.from === pid && g.completeTrade(partner as string),
  cancelTrade: (g, pid) => g.trade.value?.from === pid && g.cancelTrade(),
  playDevCard: (g, pid, [cardId, choice]) => g.playDevCard(pid, cardId as number, Array.isArray(choice) ? choice as ResourceId[] : []),
  activateKnight: (g, pid, [corner]) => g.activateKnight(pid, corner as string),
  promoteKnight: (g, pid, [corner]) => g.promoteKnight(pid, corner as string),
  chasePirates: (g, pid, [corner]) => g.chasePirates(pid, corner as string),
  moveKnight: (g, pid, [from, to]) => g.moveKnight(pid, from as string, to as string),
  buyImprovement: (g, pid, [track]) => g.buyImprovement(pid, track as ImprovementTrack),
  playProgress: (g, pid, [cardId, choice]) => g.playProgress(pid, cardId as number, (choice ?? {}) as ProgressChoice),
  discardProgress: (g, pid, [cardId]) => g.discardProgress(pid, cardId as number),
}

export class GalacticRoom extends Room {
  maxClients = 6
  phase: 'lobby' | 'game' = 'lobby'
  hostUserId: string | null = null
  config!: LobbyConfig
  seats: LobbySeat[] = []
  /** sessionId → seat index */
  seatOf = new Map<string, number>()

  game: GalacticGame | null = null
  scope = effectScope(true)
  store = new Map<string, Ref<unknown>>()
  pendingNotices: NoticeSource[] = []
  flushTimer: ReturnType<typeof setTimeout> | null = null
  /** Last sent JSON per client and state key: only changed keys are sent. */
  sent = new Map<string, Map<string, string>>()

  static async onAuth(token: string) {
    if (!token) throw new ServerError(401, 'Für den Multiplayer musst du per SSO angemeldet sein.')
    try {
      return await verifyPlayerToken(token)
    }
    catch {
      throw new ServerError(401, 'Anmeldung abgelaufen – bitte neu laden.')
    }
  }

  onCreate(options: { code?: string, config?: unknown }) {
    if (!options.code || !LOBBY_CODE.test(options.code)) throw new ServerError(400, 'Ungültiger Lobby-Code')
    const config = sanitizeLobbyConfig(options.config)
    if (!config) throw new ServerError(400, 'Ungültige Spieleinstellungen')
    this.roomId = options.code
    this.config = config
    this.seats = config.slots.map(s => ({ ...s, userId: null, name: null, connected: false }))
    // only reachable with the code (joinById), not via matchmaking
    this.setPrivate(true)

    this.onMessage('config', (client, input) => this.updateConfig(client, input))
    this.onMessage('seat', (client, input: { side?: string, color?: string }) => this.updateOwnSeat(client, input))
    this.onMessage('start', client => this.startGame(client))
    this.onMessage('action', (client, msg: { name?: string, args?: unknown[] }) => this.runAction(client, msg))
  }

  onJoin(client: Client) {
    const user = client.auth as PlayerAuth
    let seat = this.seats.findIndex(s => s.userId === user.id)
    if (seat < 0) {
      if (this.phase === 'game') throw new ServerError(4003, 'Das Spiel läuft bereits.')
      if (!this.hostUserId) {
        this.hostUserId = user.id
        seat = 0
      }
      else seat = this.seats.findIndex(s => s.type === 'open' && !s.userId)
      if (seat < 0) throw new ServerError(4001, 'Die Lobby ist voll.')
    }
    // the same account in a second tab takes the seat over
    for (const [sid, s] of this.seatOf) {
      if (s === seat) {
        this.seatOf.delete(sid)
        this.clients.find(c => c.sessionId === sid)?.leave(4000, 'In einem anderen Fenster geöffnet')
      }
    }
    this.seatOf.set(client.sessionId, seat)
    this.seats[seat] = { ...this.seats[seat]!, userId: user.id, name: user.name, connected: true }
    if (this.phase === 'game') this.setSeatHuman(seat, true)
    this.sent.delete(client.sessionId)
    this.broadcastLobby()
    if (this.phase === 'game') this.flush()
  }

  onDrop(client: Client) {
    const seat = this.seatOf.get(client.sessionId)
    if (seat === undefined) return
    this.seats[seat] = { ...this.seats[seat]!, connected: false }
    this.broadcastLobby()
    this.allowReconnection(client, this.phase === 'lobby' ? RECONNECT_LOBBY : RECONNECT_GAME)
  }

  onReconnect(client: Client) {
    const seat = this.seatOf.get(client.sessionId)
    if (seat === undefined) return
    this.seats[seat] = { ...this.seats[seat]!, connected: true }
    this.sent.delete(client.sessionId)
    this.broadcastLobby()
    if (this.phase === 'game') this.flush()
  }

  onLeave(client: Client) {
    const seat = this.seatOf.get(client.sessionId)
    this.seatOf.delete(client.sessionId)
    this.sent.delete(client.sessionId)
    if (seat === undefined) return
    const current = this.seats[seat]!
    if (this.phase === 'lobby') {
      if (seat === 0) {
        // the host closes the lobby
        this.broadcast('closed', 'Der Host hat die Lobby geschlossen.')
        this.disconnect()
        return
      }
      this.seats[seat] = { ...current, userId: null, name: null, connected: false }
    }
    else {
      // a bot plays on; the player can come back and take the seat again
      this.seats[seat] = { ...current, connected: false }
      this.setSeatHuman(seat, false)
    }
    this.broadcastLobby()
  }

  onDispose() {
    this.scope.stop()
    if (this.flushTimer) clearTimeout(this.flushTimer)
  }

  // --- lobby -------------------------------------------------------------------------------
  isHost = (client: Client) => (client.auth as PlayerAuth).id === this.hostUserId

  updateConfig(client: Client, input: unknown) {
    if (this.phase !== 'lobby' || !this.isHost(client)) return
    const config = sanitizeLobbyConfig(input)
    if (!config) return
    // seats with a player can't be removed or turned into a bot
    const taken = this.seats.map((s, i) => (i > 0 && s.userId ? i : -1)).filter(i => i > 0)
    if (taken.some(i => config.slots[i]?.type !== 'open')) {
      client.send('error', 'Belegte Plätze können nicht geändert werden.')
      this.broadcastLobby()
      return
    }
    this.config = config
    this.seats = config.slots.map((s, i) => {
      const old = this.seats[i]
      const keep = old?.userId && (i === 0 || s.type === 'open')
      return { ...s, userId: keep ? old.userId : null, name: keep ? old.name : null, connected: keep ? old.connected : false }
    })
    this.broadcastLobby()
  }

  /** A guest picks their own side and color. */
  updateOwnSeat(client: Client, input: { side?: string, color?: string }) {
    const seat = this.seatOf.get(client.sessionId)
    if (this.phase !== 'lobby' || seat === undefined) return
    const s = this.seats[seat]!
    const side = input.side === 'rebel' || input.side === 'empire' ? input.side : s.side
    const color = typeof input.color === 'string' && /^[a-z]{2,12}$/.test(input.color) ? input.color : s.color
    this.seats[seat] = { ...s, side, color }
    this.config.slots[seat] = { ...this.config.slots[seat]!, side, color }
    this.broadcastLobby()
  }

  lobbyView(seat: number): LobbyView {
    const { slots: _slots, ...config } = this.config
    return { code: this.roomId, phase: this.phase, hostUserId: this.hostUserId, seats: this.seats, config, you: seat }
  }

  broadcastLobby() {
    for (const c of this.clients) {
      const seat = this.seatOf.get(c.sessionId)
      if (seat !== undefined) c.send('lobby', this.lobbyView(seat))
    }
  }

  // --- game --------------------------------------------------------------------------------
  startGame(client: Client) {
    if (this.phase !== 'lobby' || !this.isHost(client)) return
    if (this.seats.some(s => s.type === 'open' && !s.userId)) {
      client.send('error', 'Es sind noch nicht alle offenen Plätze besetzt.')
      return
    }
    // not locked: seated players can rejoin with the code (e.g. after a reload); nobody else gets in (onJoin)
    this.phase = 'game'
    this.scope.run(() => {
      const g = createGame({
        state: <T>(key: string, init: () => T) => {
          if (!this.store.has(key)) this.store.set(key, ref(init()) as Ref<unknown>)
          return this.store.get(key) as Ref<T>
        },
        viewer: () => null,
        roll: (index, count) => (LOCAL_DICE ? Promise.resolve(localRoll(count)) : rollDrand(this.store.get('gc-game-id')!.value as string, index, count)),
        notify: (n) => {
          this.pendingNotices.push(n)
          this.scheduleFlush()
        },
        autonomous: true,
      })
      this.game = g
      g.startNewGame(newGameConfig(this.config, this.seats.map(s => s.name)))
      watch(() => GAME_STATE_KEYS.map(k => this.store.get(k)?.value), () => this.scheduleFlush(), { deep: true })
      driveGame(g, createBot(g))
      if (g.startRoll.value) g.runStartRoll()
      // players who dropped during the lobby are played by a bot until they are back
      this.seats.forEach((s, i) => { if (s.userId && !s.connected) this.setSeatHuman(i, false) })
    })
    this.broadcastLobby()
    this.flush()
  }

  /** Switches a seat between its player and a stand-in bot. */
  setSeatHuman(seat: number, human: boolean) {
    const g = this.game
    if (!g) return
    const pid = seatPlayerId(seat)
    const name = this.seats[seat]!.name ?? '?'
    g.players.value = g.players.value.map(p => (p.id !== pid || !this.seats[seat]!.userId
      ? p
      : { ...p, kind: human ? 'human' : 'bot', difficulty: 'normal', name: human ? name : `${name} (Bot)` }))
    // a bot can't answer pending decisions of the player: settle them
    if (!human) {
      const pirates = g.pirates.value
      if (pirates?.phase === 'discard' && pirates.discards[pid]) {
        const hand = g.hands.value[pid]!
        const pick: Partial<Hand> = {}
        let left = pirates.discards[pid]!
        for (const r of Object.keys(hand) as CardId[]) {
          const n = Math.min(left, hand[r])
          if (n) pick[r] = n
          left -= n
        }
        g.discardCards(pid, pick)
      }
      if (pirates?.roller === pid && pirates.phase === 'steal') g.steal(pirates.victims[0]!)
      for (let i = g.goldPicks.value[pid] ?? 0; i > 0; i--) g.chooseGold(pid, 'durasteel')
      while ((g.progressDiscard.value[pid] ?? 0) > 0) g.discardProgress(pid, g.progressHand(pid)[0]!.id)
      if (g.trade.value?.responses[pid] === 'pending') g.respondTrade(pid, false)
      if (g.trade.value?.from === pid) g.cancelTrade()
    }
  }

  runAction(client: Client, msg: { name?: string, args?: unknown[] }) {
    const seat = this.seatOf.get(client.sessionId)
    const g = this.game
    const action = msg?.name ? ACTIONS[msg.name] : undefined
    if (!g || seat === undefined || !action || g.winner.value) return
    try {
      action(g, seatPlayerId(seat), Array.isArray(msg.args) ? msg.args : [])
    }
    catch (e) {
      console.error(`[room ${this.roomId}] action ${msg.name} failed`, e)
    }
    this.scheduleFlush()
  }

  // --- sync --------------------------------------------------------------------------------
  scheduleFlush() {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, 25)
  }

  /** Sends every client the changed state keys (hidden information masked) and the new notices. */
  flush() {
    if (!this.game) return
    const notices = this.pendingNotices
    this.pendingNotices = []
    const plain = Object.fromEntries(GAME_STATE_KEYS.map(k => [k, this.store.get(k)?.value]))
    for (const c of this.clients) {
      const seat = this.seatOf.get(c.sessionId)
      if (seat === undefined) continue
      const pid = seatPlayerId(seat)
      const view = this.maskFor(pid, plain)
      const last = this.sent.get(c.sessionId) ?? new Map<string, string>()
      const changed: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(view)) {
        const json = JSON.stringify(v) ?? 'null'
        if (last.get(k) === json) continue
        last.set(k, json)
        changed[k] = v
      }
      this.sent.set(c.sessionId, last)
      if (Object.keys(changed).length) c.send('state', changed)
      for (const n of notices) {
        const rendered = renderNotice(n, pid)
        if (rendered) c.send('notice', rendered)
      }
    }
  }

  /** The state as `pid` may see it: other players' hands and cards and the deck order stay hidden. */
  maskFor(pid: string, state: Record<string, unknown>): Record<string, unknown> {
    const over = !!state['gc-winner']
    const hands = state['gc-hands'] as Record<string, Hand>
    const devCards = state['gc-dev-cards'] as Record<string, DevCard[]>
    return {
      ...state,
      // only the number of cards (handTotal) is public
      'gc-hands': Object.fromEntries(Object.entries(hands).map(([id, h]) => [id, id === pid ? h : { ...emptyHand(), wood: handTotal(h) }])),
      // action cards are revealed at the end (victory points)
      'gc-dev-cards': over ? devCards : Object.fromEntries(Object.entries(devCards).map(([id, cards]) => [id, id === pid ? cards : cards.map(c => ({ id: c.id, kind: 'fleet', title: '', fresh: c.fresh }))])),
      'gc-dev-deck': (state['gc-dev-deck'] as DevCard[]).map((_, i) => ({ id: -i - 1, kind: 'fleet', title: '' })),
      'gc-progress-decks': Object.fromEntries(Object.entries(state['gc-progress-decks'] as Record<string, unknown[]>).map(([t, deck]) => [t, deck.map((_, i) => ({ id: -i - 1, kind: 'alchemist' }))])),
    }
  }
}

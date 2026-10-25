// Game engine of Galactic Colonization (Catan rules incl. Seafarers maps and Städte & Ritter).
// Runs in the browser for solo games and authoritative on the multiplayer server (Colyseus):
// state, dice and messages come from a `GameEnv`, so the same rules apply everywhere.
import { computed, type Ref } from 'vue'
import { buildBoard, cornerIslands, type BoardCorner, type BoardTile } from './board'
import {
  BARBARIAN_STEPS, CK_COSTS, CK_VICTORY_BONUS, emptyImprovements, eventFace, KNIGHT_NAMES, KNIGHT_PIECES, MAX_WALLS, TRACK_ORDER, TRACKS,
  type Improvements, type Knight, type KnightLevel,
} from './citiesKnights'
import { DEV_CARDS, newDevDeck, type DevCard } from './devCards'
import type { RollLogEntry, RollResult } from './dice'
import { generateHarbors, harborRate, harborsValid, type Harbor } from './harbors'
import { DEFAULT_MAP, generateMap, templateById } from './maps'
import { drawsProgress, newProgressDecks, PROGRESS, PROGRESS_HAND_LIMIT, type ProgressCard, type ProgressKind } from './progressCards'
import { CARD_INFO, CARD_ORDER, COMMODITIES, COMMODITY_ORDER, RESOURCE_ORDER, RESOURCES, type CardId, type ImprovementTrack, type ResourceId } from './resources'

export type Side = 'rebel' | 'empire'
export type BuildId = 'route' | 'outpost' | 'base' | 'action' | 'wall' | 'knight'
export type Difficulty = 'easy' | 'normal' | 'hard'
/** Cards in hand: resources, plus commodities in Städte & Ritter (always 0 otherwise). */
export type Hand = Record<CardId, number>

export interface GamePlayer {
  id: string
  name: string
  side: Side
  /** Tailwind color name */
  color: string
  kind: 'human' | 'bot' | 'ai'
  /** Bot strength (AI players currently play with the bot logic too). */
  difficulty?: Difficulty
  /** Played fleet cards (Catan knights). Action cards in hand: see `devCards`. */
  fleetStrength: number
}

export interface Structure {
  owner: string
  kind: 'outpost' | 'base'
  /** Placement order (the first two of a player define their home islands). */
  order?: number
}

/** What happened when something was placed (for notifications). */
export interface PlaceResult {
  /** New island reached (+2 VP, Seafarers). */
  islandBonus: boolean
  /** Fog tiles revealed by this build. */
  discovered: BoardTile[]
}

/** One player's share of a production roll. */
export interface YieldGain {
  tile: number
  playerId: string
  resource: CardId
  amount: number
}

export interface BuildOption {
  id: BuildId
  name: string
  /** Catan equivalent */
  catan: string
  cost: Partial<Hand>
  /** Pieces per player (Catan: 15 roads, 5 settlements, 4 cities). */
  pieces?: number
  /** Only in the base game ('base') or only with Städte & Ritter ('ck'). */
  mode?: 'base' | 'ck'
}

// Catan costs: road = wood + brick, settlement = wood + brick + sheep + wheat,
// city = 2 wheat + 3 ore, development card = sheep + wheat + ore.
export const BUILD_OPTIONS: BuildOption[] = [
  { id: 'route', name: 'Hyperraumroute', catan: 'Straße', cost: { wood: 1, kyber: 1 }, pieces: 15 },
  { id: 'outpost', name: 'Außenposten', catan: 'Siedlung', cost: { wood: 1, kyber: 1, tibanna: 1, food: 1 }, pieces: 5 },
  { id: 'base', name: 'Flottenbasis', catan: 'Stadt', cost: { food: 2, durasteel: 3 }, pieces: 4 },
  { id: 'action', name: 'Aktionskarte', catan: 'Entwicklungskarte', cost: { tibanna: 1, food: 1, durasteel: 1 }, mode: 'base' },
  { id: 'wall', name: 'Schildgenerator', catan: 'Stadtmauer', cost: { ...CK_COSTS.wall }, pieces: MAX_WALLS, mode: 'ck' },
  { id: 'knight', name: 'Jägerstaffel', catan: 'Ritter', cost: { ...CK_COSTS.knight }, pieces: KNIGHT_PIECES, mode: 'ck' },
]

/** Build options of the current game mode. */
export const buildOptionsFor = (ck: boolean) => BUILD_OPTIONS.filter(o => !o.mode || o.mode === (ck ? 'ck' : 'base'))



/** Probability pips per number token (Catan dots). */
export const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }

export interface NewGameConfig {
  mapId: string
  players?: GamePlayer[]
  victoryPoints?: number
  randomStart?: boolean
  /** Catan "friendly robber": no blocking players with ≤ 2 VP. */
  friendlyPirates?: boolean
  /** Expansion Städte & Ritter. */
  citiesKnights?: boolean
}

/** Setup phase: snake order 1 → 2 → 3 → 3 → 2 → 1, each step = one outpost + one route. */
export interface SetupState {
  order: string[]
  step: number
  need: 'outpost' | 'route'
  /** The route of this step must touch this outpost. */
  lastOutpost: string | null
}

/** Pirate sequence after a 7 (Catan robber): discard → move → steal. */
export interface PirateState {
  phase: 'discard' | 'move' | 'steal'
  /** Player who rolled the 7 and moves the pirates. */
  roller: string
  /** Cards each human player still has to discard (bots discard at once). */
  discards: Record<string, number>
  /** Possible victims after moving (phase 'steal'). */
  victims: string[]
  /** Inquisitor (Catan: Bishop): steal from every player at the new system. */
  bishop?: boolean
}

/** Decisions for playing a progress card (see `PROGRESS[kind].input`). */
export interface ProgressChoice {
  dice?: [number, number]
  card?: CardId
  player?: string
  cards?: CardId[]
  progressId?: number
  tiles?: number[]
  corner?: string
  corners?: string[]
  edge?: string
}

/** Start roll: every player rolls, the highest sum begins (ties roll again). */
export interface StartRollState {
  phase: 'pending' | 'rolling' | 'done'
  /** Re-roll round (1 = first, 2+ = tie-breaks). */
  round: number
  results: { playerId: string, round: number, values: [number, number] | null }[]
  /** Player currently rolling. */
  current: string | null
  winner: string | null
}

export type TradeResponse = 'pending' | 'accept' | 'decline' | 'counter'

/**
 * Catan domestic trade: the active player offers cards (or only asks for cards: a request,
 * `give` empty), the others accept, decline or make a counter offer.
 */
export interface TradeOffer {
  id: number
  from: string
  /** Cards the offering player gives. */
  give: Partial<Hand>
  /** Cards the offering player wants in return. */
  want: Partial<Hand>
  /** 'counter' = the player offers the wanted cards, but wants `counters[pid]` in return. */
  responses: Record<string, TradeResponse>
  counters: Record<string, Partial<Hand>>
  /** Offers of bots expire (the human may simply ignore them). */
  expiresAt: number | null
}

/** Cards per bank trade (Catan maritime trade without harbor). */
export const BANK_RATE = 4

/** A message for the HUD (shown as toast by GameNotifier). */
export interface GameNotice {
  id: number
  title: string
  description?: string
  icon?: string
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'
}
export type Notice = Omit<GameNotice, 'id'>
/**
 * A message as seen by `viewer` (the player looking at it, null = spectator): "Du stiehlst …" for the thief,
 * "X stiehlt dir …" for the victim. Returning null hides it from that viewer.
 */
export type NoticeSource = Notice | ((viewer: string | null) => Notice | null)
export const renderNotice = (n: NoticeSource, viewer: string | null) => (typeof n === 'function' ? n(viewer) : n)

/** Where the engine runs. */
export interface GameEnv {
  /** State container: Nuxt `useState` in the browser, plain refs on the server. */
  state: <T>(key: string, init: () => T) => Ref<T>
  /** The player this instance plays for (browser: the local human; server: null). */
  viewer: () => string | null
  /** Dice from the random source, with proof for the roll log. */
  roll: (index: number, count: number) => Promise<RollResult>
  notify: (n: NoticeSource) => void
  /**
   * Server: the engine commits rolled dice and credits production itself.
   * Browser (solo): DiceRoll.vue / YieldFlights.vue do it when their animations end.
   */
  autonomous: boolean
}

/** Server: dice are committed after this long, so clients can play the dice animation first. */
export const ROLL_COMMIT_MS = 1900

/** useState keys that make up a game (saved / synced). */
export const GAME_STATE_KEYS = ['gc-map', 'gc-tiles', 'gc-players', 'gc-active', 'gc-turn', 'gc-goal', 'gc-dice', 'gc-dice-roll', 'gc-hands', 'gc-setup', 'gc-start-index', 'gc-structures', 'gc-routes', 'gc-pirate', 'gc-gold-picks', 'gc-roll-log', 'gc-game-id', 'gc-pirates', 'gc-friendly', 'gc-start-roll', 'gc-harbors', 'gc-dev-deck', 'gc-dev-cards', 'gc-dev-played', 'gc-free-routes', 'gc-winner', 'gc-ck', 'gc-improvements', 'gc-metropolis', 'gc-walls', 'gc-knights', 'gc-barbarians', 'gc-defender', 'gc-event-die', 'gc-progress-decks', 'gc-progress', 'gc-progress-vp', 'gc-merchant', 'gc-boosts', 'gc-progress-discard', 'gc-trade', 'gc-yield'] as const

export const emptyHand = (): Hand => ({ wood: 0, kyber: 0, tibanna: 0, food: 0, durasteel: 0, bacta: 0, fuel: 0, beskar: 0 })
export const handTotal = (h: Hand | undefined) => (h ? CARD_ORDER.reduce((a, r) => a + (h[r] ?? 0), 0) : 0)
let eventSeq = 0
/** Unique, increasing id for events (Date.now() alone can repeat within a millisecond). */
const eventId = () => Date.now() * 1000 + (eventSeq++ % 1000)
const randomResource = () => RESOURCE_ORDER[Math.floor(Math.random() * 5)]!

/** A random card from a hand (weighted by count), or null if empty. */
function randomCard(h: Hand): CardId | null {
  const cards = CARD_ORDER.flatMap(r => Array<CardId>(h[r] ?? 0).fill(r))
  return cards[Math.floor(Math.random() * cards.length)] ?? null
}

export const cardCount = (part: Partial<Hand>) => Object.values(part).reduce((a, b) => a + (b ?? 0), 0)

/** "2 Holz, 1 Kyber" */
export function describeCards(part: Partial<Hand>) {
  return CARD_ORDER.filter(r => part[r]).map(r => `${part[r]} ${CARD_INFO[r].name}`).join(', ')
}

const wait = (ms: number) => new Promise(res => setTimeout(res, ms))

function emptyTile(tiles: BoardTile[]) {
  return Math.max(0, tiles.findIndex(t => !t.resource && !t.gold && !t.fog))
}

const DEFAULT_PLAYERS: GamePlayer[] = [
  { id: 'p1', name: 'Du', side: 'rebel', color: 'yellow', kind: 'human', fleetStrength: 0 },
  { id: 'p2', name: 'Bot (leicht)', side: 'empire', color: 'red', kind: 'bot', difficulty: 'easy', fleetStrength: 0 },
  { id: 'p3', name: 'Bot (leicht)', side: 'rebel', color: 'sky', kind: 'bot', difficulty: 'easy', fleetStrength: 0 },
]

export type GalacticGame = ReturnType<typeof createGame>

/** The game rules on top of a state container (see `GameEnv`). */
export function createGame(env: GameEnv) {
  const useState = env.state
  const players = useState<GamePlayer[]>('gc-players', () => DEFAULT_PLAYERS)
  const activeIndex = useState('gc-active', () => 0)
  /** Index of the player who won the start roll (begins setup and round 1). */
  const startIndex = useState('gc-start-index', () => 0)
  const turn = useState('gc-turn', () => 1)
  const victoryGoal = useState('gc-goal', () => 10)
  const dice = useState<[number, number] | null>('gc-dice', () => null)
  /** A roll in progress: DiceRoll.vue animates it until `values` arrive from the random source, then commits them to `dice`. */
  const diceRoll = useState<{ id: number, values: [number, number] | null, event?: number } | null>('gc-dice-roll', () => null)
  /** Every roll with its source and proof (verifiable for drand / random.org). */
  const rollLog = useState<RollLogEntry[]>('gc-roll-log', () => [])
  /** Resource cards of every player. */
  const hands = useState<Record<string, Hand>>('gc-hands', () => Object.fromEntries(DEFAULT_PLAYERS.map(p => [p.id, emptyHand()])))
  /** Outposts / bases by corner id. */
  const structures = useState<Record<string, Structure>>('gc-structures', () => ({}))
  /** Route owner by edge id. */
  const routes = useState<Record<string, string>>('gc-routes', () => ({}))
  /** Map template and the generated (random) tiles of this game. */
  const mapId = useState('gc-map', () => DEFAULT_MAP)
  const tiles = useState<BoardTile[]>('gc-tiles', () => generateMap(mapId.value))
  const board = computed(() => buildBoard(tiles.value))
  const template = computed(() => templateById(mapId.value))
  /** Tile blocked by the pirates (Catan robber): starts on an empty tile. */
  const pirateTile = useState('gc-pirate', () => emptyTile(tiles.value))
  /** Gold fields: resources each human player still has to choose (bots get a random one). */
  const goldPicks = useState<Record<string, number>>('gc-gold-picks', () => ({}))
  const setup = useState<SetupState | null>('gc-setup', () => null)
  const pirates = useState<PirateState | null>('gc-pirates', () => null)
  const startRoll = useState<StartRollState | null>('gc-start-roll', () => null)
  const friendlyPirates = useState('gc-friendly', () => false)
  const trade = useState<TradeOffer | null>('gc-trade', () => null)
  /** Action cards: the face-down supply and every player's hand. */
  const devDeck = useState<DevCard[]>('gc-dev-deck', () => newDevDeck())
  const devCards = useState<Record<string, DevCard[]>>('gc-dev-cards', () => ({}))
  /** The active player already played an action card this turn (max. one). */
  const devPlayed = useState('gc-dev-played', () => false)
  /** Hyperraumvermessung: free routes the active player may still place. */
  const freeRoutes = useState('gc-free-routes', () => 0)
  /** Player who reached the victory goal (game over). */
  const winner = useState<string | null>('gc-winner', () => null)
  // --- Städte & Ritter state ---
  /** Expansion Städte & Ritter is active. */
  const ck = useState('gc-ck', () => false)
  const improvements = useState<Record<string, Improvements>>('gc-improvements', () => ({}))
  /** Metropolis per improvement track: corner id of the city. */
  const metropolis = useState<Record<ImprovementTrack, string | null>>('gc-metropolis', () => ({ trade: null, politics: null, science: null }))
  /** City walls (Schildgeneratoren) by corner id. */
  const walls = useState<Record<string, boolean>>('gc-walls', () => ({}))
  /** Knights (fleets) by corner id. */
  const knights = useState<Record<string, Knight>>('gc-knights', () => ({}))
  /** Barbarian fleet (Hutten-Armada): step on the track and attacks so far (the pirates only move after the first). */
  const barbarians = useState('gc-barbarians', () => ({ step: 0, attacks: 0 }))
  /** "Verteidiger der Galaxis" victory points. */
  const defenderPoints = useState<Record<string, number>>('gc-defender', () => ({}))
  /** Event die of the current turn (1–6). */
  const eventDie = useState<number | null>('gc-event-die', () => null)
  /** Progress cards: three decks, every player's hand, revealed victory point cards. */
  const progressDecks = useState<Record<ImprovementTrack, ProgressCard[]>>('gc-progress-decks', () => newProgressDecks())
  const progressHands = useState<Record<string, ProgressCard[]>>('gc-progress', () => ({}))
  const progressVP = useState<Record<string, ProgressKind[]>>('gc-progress-vp', () => ({}))
  /** Handelskonvoi (Catan: merchant): 2:1 for the tile's resource, +1 VP for its owner. */
  const merchant = useState<{ tile: number, owner: string } | null>('gc-merchant', () => null)
  /** Effects for the rest of the turn: Montagedroiden (crane), Frachterflotte (merchant fleet). */
  const boosts = useState<{ crane: boolean, fleet: CardId | null }>('gc-boosts', () => ({ crane: false, fleet: null }))
  /** Human players with more than 4 progress cards must discard this many. */
  const progressDiscard = useState<Record<string, number>>('gc-progress-discard', () => ({}))
  /** Trade stations (Catan harbors) of this map. */
  const harbors = useState<Harbor[]>('gc-harbors', () => generateHarbors(tiles.value, templateById(mapId.value).harbors))
  const notify = env.notify
  /** Unique id of this game (part of the verifiable drand dice derivation). */
  const gameId = useState('gc-game-id', () => crypto.randomUUID())
  /** A bot is currently acting (prevents overlapping bot turns). */
  const botBusy = useState('gc-bot-busy', () => false)
  /** Last production roll, animated by YieldProjector/YieldFlights. */
  const yieldEvent = useState<{ id: number, sum: number, gains: YieldGain[], tiles: number[], blocked: number[] } | null>('gc-yield', () => null)

  /** The player this instance plays for (null on the server, see `env.viewer`). */
  const me = computed(() => players.value.find(p => p.id === env.viewer())!)
  const meId = () => env.viewer() ?? ''
  const activePlayer = computed(() => players.value[activeIndex.value]!)
  const myTurn = computed(() => activePlayer.value.id === env.viewer())
  const playerById = (pid: string) => players.value.find(p => p.id === pid)
  const playerName = (pid: string) => playerById(pid)?.name ?? '?'
  /** Human players decide themselves (gold, discards, victims); bots are decided for by the engine. */
  const isHuman = (pid: string) => playerById(pid)?.kind === 'human'
  const addGold = (pid: string, n: number) => { goldPicks.value = { ...goldPicks.value, [pid]: (goldPicks.value[pid] ?? 0) + n } }
  const handOf = (pid: string): Hand => {
    const h = (hands.value[pid] ??= emptyHand())
    if (h.bacta === undefined) Object.assign(h, { bacta: 0, fuel: 0, beskar: 0 }) // saves from before Städte & Ritter
    return h
  }
  /** The local player's hand. */
  const resources = computed(() => (env.viewer() ? handOf(meId()) : emptyHand()))

  // --- counts -------------------------------------------------------------
  const countStructures = (pid: string, kind: Structure['kind']) =>
    Object.values(structures.value).filter(s => s.owner === pid && s.kind === kind).length
  const countRoutes = (pid: string) => Object.values(routes.value).filter(o => o === pid).length

  const knightsOf = (pid: string) => Object.entries(knights.value).filter(([, k]) => k.owner === pid)
  const wallCount = (pid: string) => Object.keys(walls.value).filter(c => walls.value[c] && structures.value[c]?.owner === pid).length

  function piecesUsedBy(pid: string): Record<BuildId, number> {
    return {
      route: countRoutes(pid),
      outpost: countStructures(pid, 'outpost'),
      base: countStructures(pid, 'base'),
      action: 0,
      wall: wallCount(pid),
      knight: knightsOf(pid).filter(([, k]) => k.level === 1).length,
    }
  }
  const piecesUsed = computed(() => piecesUsedBy(meId()))
  const piecesLeft = (pid: string, option: BuildOption) => option.pieces === undefined || piecesUsedBy(pid)[option.id] < option.pieces

  /** Setup phase: the current player's outpost / route is free. */
  function isFree(id: BuildId, pid = meId()) {
    const s = setup.value
    if (s) return s.order[s.step] === pid && s.need === id
    return id === 'route' && freeRoutes.value > 0 && activePlayer.value.id === pid
  }

  /** An opponent's structure or knight on a corner (breaks routes, Catan rule). */
  const blockedFor = (corner: string, pid: string) => {
    const s = structures.value[corner]
    const k = knights.value[corner]
    return (!!s && s.owner !== pid) || (!!k && k.owner !== pid)
  }

  // --- longest route (Catan longest road: opponents' structures and knights break a chain) ---
  function longestRoute(pid: string): number {
    const own = Object.keys(routes.value).filter(e => routes.value[e] === pid)
    const used = new Set<string>()
    const walk = (corner: string): number => {
      if (used.size > 0 && blockedFor(corner, pid)) return used.size
      let best = used.size
      for (const e of board.value.corners[corner]!.edges) {
        if (routes.value[e] !== pid || used.has(e)) continue
        const edge = board.value.edges[e]!
        used.add(e)
        best = Math.max(best, walk(edge.a === corner ? edge.b : edge.a))
        used.delete(e)
      }
      return best
    }
    return Math.max(0, ...own.flatMap(e => [walk(board.value.edges[e]!.a), walk(board.value.edges[e]!.b)]))
  }

  // Catan bonus cards: at least 5 routes / 3 fleet cards, and strictly more than everyone else.
  const longestRouteHolder = computed(() => holder(p => longestRoute(p.id), 5))
  const largestFleetHolder = computed(() => (ck.value ? null : holder(p => p.fleetStrength, 3)))
  function holder(stat: (p: GamePlayer) => number, min: number) {
    const values = players.value.map(stat)
    const best = Math.max(...values)
    const leaders = players.value.filter((_, i) => values[i] === best)
    return best >= min && leaders.length === 1 ? leaders[0]!.id : null
  }

  /** Seafarers: islands reached beyond the player's home islands (first two outposts). */
  function bonusIslands(pid: string): number[] {
    if (!template.value.islandBonus) return []
    const own = Object.entries(structures.value)
      .filter(([c, st]) => st.owner === pid && board.value.corners[c])
      .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
    const home = new Set(own.slice(0, 2).flatMap(([c]) => cornerIslands(board.value, c)))
    const reached = new Set(own.slice(2).flatMap(([c]) => cornerIslands(board.value, c)))
    return [...reached].filter(i => !home.has(i))
  }

  const devHand = (pid: string) => devCards.value[pid] ?? []
  const progressHand = (pid: string) => progressHands.value[pid] ?? []

  /** `victoryPoints` = visible to everyone, `hiddenPoints` = own victory point cards, `totalPoints` = both. */
  function stats(p: GamePlayer) {
    const islandPoints = 2 * bonusIslands(p.id).length
    // Städte & Ritter: metropolis +2, defender cards +1 each
    const metropolisPoints = 2 * metropolisesOf(p.id).length
    const victoryPoints = countStructures(p.id, 'outpost') + 2 * countStructures(p.id, 'base') + islandPoints
      + (longestRouteHolder.value === p.id ? 2 : 0) + (largestFleetHolder.value === p.id ? 2 : 0)
      + metropolisPoints + (defenderPoints.value[p.id] ?? 0)
      + (progressVP.value[p.id]?.length ?? 0) + (merchant.value?.owner === p.id ? 1 : 0)
    const hiddenPoints = devHand(p.id).filter(c => c.kind === 'victory').length
    return {
      victoryPoints,
      hiddenPoints,
      totalPoints: victoryPoints + hiddenPoints,
      resourceCards: handTotal(hands.value[p.id]),
      actionCards: ck.value ? progressHand(p.id).length : devHand(p.id).length,
      routeLength: longestRoute(p.id),
      islandPoints,
      knightStrength: activeKnightStrength(p.id),
      knightCount: knightsOf(p.id).length,
    }
  }

  /** Städte & Ritter helpers */
  const metropolisesOf = (pid: string) => TRACK_ORDER.filter(t => metropolis.value[t] && structures.value[metropolis.value[t]!]?.owner === pid)
  const metropolisAt = (corner: string) => TRACK_ORDER.find(t => metropolis.value[t] === corner) ?? null
  const activeKnightStrength = (pid: string) => knightsOf(pid).reduce((a, [, k]) => a + (k.active ? k.level : 0), 0)
  const improvementsOf = (pid: string): Improvements => (improvements.value[pid] ??= emptyImprovements())
  /** Hand limit on a 7: 7, plus 2 per city wall (Städte & Ritter). */
  const handLimit = (pid: string) => 7 + 2 * wallCount(pid)
  const handSize = (pid: string) => handTotal(hands.value[pid])

  // --- build rules ----------------------------------------------------------
  /** Corner ids (outpost/base) or edge ids (route) where `pid` may build `id`. */
  function validSites(id: BuildId, pid = meId()): string[] {
    const s = structures.value
    const r = routes.value
    const kn = knights.value
    const freeCorner = (c: BoardCorner) => !s[c.id] && !kn[c.id] && c.neighbors.every(n => !s[n]) // distance rule

    const st = setup.value
    if (st) {
      if (st.order[st.step] !== pid || st.need !== id) return []
      if (id === 'outpost') return Object.values(board.value.corners).filter(freeCorner).map(c => c.id)
      if (id === 'route' && st.lastOutpost) return board.value.corners[st.lastOutpost]!.edges.filter(e => !r[e])
      return []
    }

    if (id === 'outpost') {
      return Object.values(board.value.corners)
        .filter(c => freeCorner(c) && c.edges.some(e => r[e] === pid))
        .map(c => c.id)
    }
    if (id === 'base') {
      return Object.keys(s).filter(c => s[c]!.owner === pid && s[c]!.kind === 'outpost')
    }
    if (id === 'wall') {
      return Object.keys(s).filter(c => s[c]!.owner === pid && s[c]!.kind === 'base' && !walls.value[c])
    }
    if (id === 'knight') {
      // a free corner on the own route network
      return Object.values(board.value.corners)
        .filter(c => !s[c.id] && !kn[c.id] && c.edges.some(e => r[e] === pid))
        .map(c => c.id)
    }
    if (id === 'route') {
      // A route must touch an own structure, or an own route at a corner not blocked by an opponent.
      const reaches = (corner: string, edge: string) => {
        const owner = s[corner]
        if (owner) return owner.owner === pid
        if (blockedFor(corner, pid)) return false
        return board.value.corners[corner]!.edges.some(e => e !== edge && r[e] === pid)
      }
      return Object.values(board.value.edges).filter(e => !r[e.id] && (reaches(e.a, e.id) || reaches(e.b, e.id))).map(e => e.id)
    }
    return []
  }

  /** Enough resources for `option` (ignores setup). */
  function canPay(pid: string, option: BuildOption) {
    const h = handOf(pid)
    return Object.entries(option.cost).every(([r, n]) => h[r as CardId] >= n!)
  }

  /** Affordable right now (pieces left and resources or free in setup). */
  function canAfford(option: BuildOption, pid = meId()) {
    return piecesLeft(pid, option) && (isFree(option.id, pid) || canPay(pid, option))
  }

  /** Why `pid` (default: the local player) can't start building `option` right now (null = ok). */
  function buildBlocker(option: BuildOption, pid = meId()): string | null {
    if (winner.value) return 'Das Spiel ist vorbei'
    if (activePlayer.value.id !== pid || startRoll.value) return 'Du bist nicht am Zug'
    if (setup.value) {
      if (option.id !== setup.value.need) {
        return setup.value.need === 'outpost' ? 'Aufbauphase: setze zuerst einen Außenposten' : 'Aufbauphase: setze jetzt eine Route an deinen Außenposten'
      }
      return validSites(option.id, pid).length ? null : 'Kein gültiger Bauplatz'
    }
    if (pirates.value) return 'Erst die Piraten abhandeln'
    if (option.id === 'action' && !devDeck.value.length) return 'Keine Aktionskarten mehr im Vorrat'
    if (!piecesLeft(pid, option)) return option.id === 'wall' ? `Höchstens ${MAX_WALLS} Schildgeneratoren` : 'Keine Teile mehr übrig'
    if (!canAfford(option, pid)) return 'Nicht genug Rohstoffe'
    if (!dice.value && !isFree(option.id, pid)) return 'Erst würfeln'
    if (option.id !== 'action' && validSites(option.id, pid).length === 0) {
      return option.id === 'wall' ? 'Schildgeneratoren nur an Städten (ohne Generator)' : option.id === 'knight' ? 'Kein freier Platz an deinen Routen' : 'Kein gültiger Bauplatz'
    }
    return null
  }

  function pay(pid: string, option: BuildOption) {
    const h = handOf(pid)
    for (const [r, n] of Object.entries(option.cost)) h[r as CardId] -= n!
  }

  /** Reveals fog tiles touching the given corners; new land rewards the explorer (Seafarers). */
  function explore(cornerIds: string[], pid: string): BoardTile[] {
    const touched = new Set(cornerIds.flatMap(c => board.value.corners[c]!.tiles))
    const revealed: BoardTile[] = []
    tiles.value = tiles.value.map((tile, i) => {
      if (!touched.has(i) || !tile.fog) return tile
      const { fog, ...rest } = tile
      const open: BoardTile = { ...rest, resource: fog.resource, number: fog.number, gold: fog.gold, land: fog.land, fog: null }
      revealed.push(open)
      if (open.resource) applyGain(pid, open.resource, 1)
      else if (open.gold) {
        if (isHuman(pid)) addGold(pid, 1)
        else applyGain(pid, randomResource(), 1)
      }
      return open
    })
    return revealed
  }

  /** Places `kind` for `pid` on a corner/edge id (used by the human and the bots). */
  function build(pid: string, kind: Exclude<BuildId, 'action'>, siteId: string): PlaceResult | null {
    const option = BUILD_OPTIONS.find(o => o.id === kind)!
    if (!piecesLeft(pid, option) || !validSites(kind, pid).includes(siteId)) return null
    const free = isFree(kind, pid)
    if (!free && !canPay(pid, option)) return null
    const st = setup.value
    const secondSetupOutpost = !!st && kind === 'outpost' && st.step >= players.value.length
    if (!free) pay(pid, option)
    else if (!st && kind === 'route') freeRoutes.value--

    // Städte & Ritter pieces that don't touch the board graph
    if (kind === 'wall') {
      walls.value = { ...walls.value, [siteId]: true }
      notify(v => (v === pid ? null : { title: `${playerName(pid)} baut einen Schildgenerator`, icon: 'i-lucide-shield', color: 'neutral' }))
      return { islandBonus: false, discovered: [] }
    }
    if (kind === 'knight') {
      knights.value = { ...knights.value, [siteId]: { owner: pid, level: 1, active: false, fresh: true } }
      notify(v => (v === pid ? null : { title: `${playerName(pid)} stellt eine ${KNIGHT_NAMES[1]} auf`, icon: 'i-lucide-swords', color: 'neutral' }))
      return { islandBonus: false, discovered: [] }
    }

    const islandsBefore = bonusIslands(pid).length
    let corners: string[]
    if (kind === 'route') {
      routes.value = { ...routes.value, [siteId]: pid }
      corners = [board.value.edges[siteId]!.a, board.value.edges[siteId]!.b]
    }
    else {
      const order = Math.max(0, ...Object.values(structures.value).map(s => s.order ?? 0)) + 1
      const prev = structures.value[siteId]
      // Städte & Ritter: the second setup outpost is placed as a city
      const asCity = kind === 'base' || (secondSetupOutpost && ck.value)
      structures.value = { ...structures.value, [siteId]: { owner: pid, kind: asCity ? 'base' : 'outpost', order: prev?.order ?? order } }
      corners = [siteId]
    }
    const discovered = explore(corners, pid)
    if (secondSetupOutpost) startYield(siteId, pid)

    if (st) {
      if (kind === 'outpost') setup.value = { ...st, need: 'route', lastOutpost: siteId }
      else advanceSetup()
    }

    const islandBonus = bonusIslands(pid).length > islandsBefore
    if (islandBonus) {
      notify(v => (v === pid
        ? { title: 'Neue Insel erreicht: +2 Siegpunkte', icon: 'i-lucide-flag', color: 'primary' }
        : { title: `${playerName(pid)} erreicht eine neue Insel (+2 SP)`, icon: 'i-lucide-flag', color: 'warning' }))
    }
    for (const tile of discovered) {
      const what = tile.gold
        ? 'ein Handelsnexus (Gold)'
        : tile.resource ? `${RESOURCES[tile.resource].source} – ${RESOURCES[tile.resource].name} (${tile.number})` : 'leerer Raum'
      const reward = tile.gold ? ' Wähle 1 Rohstoff als Fund.' : tile.resource ? ` +1 ${RESOURCES[tile.resource].name} als Fund.` : ''
      notify(v => (v === pid ? { title: 'Nebel erkundet', description: `Entdeckt: ${what}.${reward}`, icon: 'i-lucide-telescope', color: 'info' } : null))
    }
    return { islandBonus, discovered }
  }

  /** A human player's build: only on their turn, with the build rules of the moment (see `buildBlocker`). */
  function buildAs(pid: string, kind: Exclude<BuildId, 'action'>, siteId: string): PlaceResult | null {
    const option = BUILD_OPTIONS.find(o => o.id === kind)
    if (!option || buildBlocker(option, pid)) return null
    return build(pid, kind, siteId)
  }

  /** Catan setup: the second outpost yields one resource from each adjacent system. */
  function startYield(cornerId: string, pid: string) {
    const gains: YieldGain[] = []
    const flashed: number[] = []
    for (const t of board.value.corners[cornerId]!.tiles) {
      const tile = tiles.value[t]!
      if (tile.resource) {
        gains.push({ tile: t, playerId: pid, resource: tile.resource, amount: 1 })
        flashed.push(t)
      }
      else if (tile.gold) {
        if (isHuman(pid)) addGold(pid, 1)
        else gains.push({ tile: t, playerId: pid, resource: randomResource(), amount: 1 })
        flashed.push(t)
      }
    }
    yieldEvent.value = { id: eventId(), sum: 0, gains, tiles: flashed, blocked: [] }
    if (env.autonomous) creditGains(gains)
  }

  /** A human player picks a resource for a gold field. */
  function chooseGold(pid: string, resource: ResourceId) {
    if ((goldPicks.value[pid] ?? 0) <= 0 || !RESOURCE_ORDER.includes(resource)) return false
    goldPicks.value = { ...goldPicks.value, [pid]: goldPicks.value[pid]! - 1 }
    handOf(pid)[resource]++
    return true
  }

  /** Buys the top action card (Catan development card). Returns it, or null. */
  function buyActionCard(pid = meId()): DevCard | null {
    const option = BUILD_OPTIONS.find(o => o.id === 'action')!
    if (ck.value || winner.value || !devDeck.value.length || !canPay(pid, option)) return null
    if (isHuman(pid) ? buildBlocker(option, pid) : !canTrade(pid)) return null
    pay(pid, option)
    const [card, ...rest] = devDeck.value
    devDeck.value = rest
    const bought = { ...card!, fresh: true }
    devCards.value = { ...devCards.value, [pid]: [...devHand(pid), bought] }
    const info = DEV_CARDS[bought.kind]
    notify(v => (v === pid
      ? {
          title: `Aktionskarte: ${bought.kind === 'victory' ? `${bought.title} (Siegpunkt)` : info.name}`,
          description: bought.kind === 'victory' ? 'Zählt sofort als verdeckter Siegpunkt.' : `${info.description} Ab deinem nächsten Zug spielbar.`,
          icon: info.icon,
          color: 'primary',
        }
      : { title: `${playerName(pid)} kauft eine Aktionskarte`, icon: 'i-lucide-scroll-text', color: 'neutral' }))
    return bought
  }

  /** Why `pid` can't play `card` right now (null = ok). Any card may be played before or after rolling. */
  function devCardBlocker(pid: string, card: DevCard): string | null {
    if (winner.value) return 'Das Spiel ist vorbei'
    if (activePlayer.value.id !== pid || setup.value || startRoll.value) return 'Nur in deinem Zug'
    if (pirates.value || diceRoll.value) return 'Erst die laufende Aktion abschließen'
    if (card.kind === 'victory') return 'Siegpunkte bleiben verdeckt und zählen automatisch'
    if (card.fresh) return 'Erst ab deinem nächsten Zug spielbar'
    if (devPlayed.value) return 'Nur eine Aktionskarte pro Zug'
    if (card.kind === 'survey') {
      const option = BUILD_OPTIONS.find(o => o.id === 'route')!
      if (!piecesLeft(pid, option) || !validSites('route', pid).length) return 'Kein Bauplatz für eine Route'
    }
    return null
  }

  /**
   * Plays an action card. `choice`: two resources for Schmugglerfund, one for Handelsembargo.
   * Returns false if not allowed.
   */
  function playDevCard(pid: string, cardId: number, choice: ResourceId[] = []) {
    const card = devHand(pid).find(c => c.id === cardId)
    if (!card || devCardBlocker(pid, card)) return false
    if (card.kind === 'smuggler' && choice.length !== 2) return false
    if (card.kind === 'embargo' && choice.length !== 1) return false
    if (choice.some(r => !RESOURCE_ORDER.includes(r))) return false
    devCards.value = { ...devCards.value, [pid]: devHand(pid).filter(c => c.id !== cardId) }
    devPlayed.value = true
    const info = DEV_CARDS[card.kind]
    const who = (v: string | null) => (v === pid ? 'Du spielst' : `${playerName(pid)} spielt`)

    if (card.kind === 'fleet') {
      players.value = players.value.map(p => (p.id === pid ? { ...p, fleetStrength: p.fleetStrength + 1 } : p))
      notify(v => ({ title: `${who(v)} ${info.name}`, description: 'Die Piraten werden versetzt.', icon: info.icon, color: 'warning' }))
      beginMove(pid)
    }
    else if (card.kind === 'survey') {
      const left = 15 - countRoutes(pid)
      freeRoutes.value = Math.min(2, left)
      notify(v => (v === pid ? null : { title: `${who(v)} ${info.name}`, description: '2 Routen gratis.', icon: info.icon, color: 'neutral' }))
    }
    else if (card.kind === 'smuggler') {
      for (const r of choice) applyGain(pid, r, 1)
      notify(v => ({ title: `${who(v)} ${info.name}`, description: `+ ${choice.map(r => RESOURCES[r].name).join(', ')}`, icon: info.icon, color: v === pid ? 'success' : 'neutral' }))
    }
    else if (card.kind === 'embargo') {
      const r = choice[0]!
      let total = 0
      for (const p of players.value) {
        if (p.id === pid) continue
        const n = handOf(p.id)[r]
        handOf(p.id)[r] = 0
        total += n
        if (n) notify(v => (v === p.id ? { title: `Embargo: du gibst ${n} ${RESOURCES[r].name} an ${playerName(pid)}`, icon: info.icon, color: 'error' } : null))
      }
      applyGain(pid, r, total)
      notify(v => ({ title: `${who(v)} ${info.name} auf ${RESOURCES[r].name}`, description: `${total} Karten eingezogen.`, icon: info.icon, color: v === pid ? 'success' : 'warning' }))
    }
    return true
  }

  /** Catan: whoever reaches the goal on their own turn wins (victory point cards included). */
  function checkVictory() {
    if (winner.value || setup.value || startRoll.value) return
    const p = activePlayer.value
    if (stats(p).totalPoints < victoryGoal.value) return
    winner.value = p.id
    trade.value = null
  }

  // --- setup phase ------------------------------------------------------------
  /** Snake order from the start player: 1 → 2 → 3 → 3 → 2 → 1. */
  function beginSetup(start: number) {
    startIndex.value = start
    const ids = players.value.map(p => p.id)
    const order = [...ids.slice(start), ...ids.slice(0, start)]
    setup.value = { order: [...order, ...[...order].reverse()], step: 0, need: 'outpost', lastOutpost: null }
    activeIndex.value = start
    dice.value = null
  }

  function advanceSetup() {
    const st = setup.value
    if (!st) return
    const step = st.step + 1
    if (step >= st.order.length) {
      setup.value = null
      activeIndex.value = startIndex.value
      turn.value = 1
      dice.value = null
      notify({ title: 'Aufbauphase beendet', description: `${activePlayer.value.name} beginnt Runde 1.`, icon: 'i-lucide-flag', color: 'primary' })
      return
    }
    setup.value = { ...st, step, need: 'outpost', lastOutpost: null }
    activeIndex.value = players.value.findIndex(p => p.id === st.order[step])
  }

  // --- production -------------------------------------------------------------
  /**
   * Catan production: every tile with the rolled number yields 1 resource per adjacent
   * outpost and 2 per base, except the tile blocked by the pirates. A 7 starts the pirates.
   * Resources are credited by `applyGain` when the yield animation lands.
   */
  function produce(sum: number, event?: number, red?: number) {
    // Städte & Ritter: the event die is resolved before production
    if (ck.value && event) resolveEvent(event, red ?? 6)
    const flashed: number[] = []
    const blocked: number[] = []
    const gains: YieldGain[] = []
    if (sum === 7) startPirates()
    else {
      board.value.tiles.forEach((tile, t) => {
        if (!(tile.resource || tile.gold) || tile.number !== sum) return
        if (t === pirateTile.value) { blocked.push(t); return }
        flashed.push(t)
        for (const c of Object.values(board.value.corners)) {
          const s = structures.value[c.id]
          if (!s || !c.tiles.includes(t)) continue
          const city = s.kind === 'base'
          const amount = city ? 2 : 1
          const commodity = ck.value && city && tile.resource ? COMMODITY_ORDER.find(k => COMMODITIES[k].from === tile.resource) : undefined
          if (tile.resource && commodity) {
            // C&K city on Waldmond / Gasriese / Asteroidenfeld: 1 resource + 1 commodity
            gains.push({ tile: t, playerId: s.owner, resource: tile.resource, amount: 1 })
            gains.push({ tile: t, playerId: s.owner, resource: commodity, amount: 1 })
          }
          else if (tile.resource) gains.push({ tile: t, playerId: s.owner, resource: tile.resource, amount })
          else if (isHuman(s.owner)) addGold(s.owner, amount) // gold field: humans choose
          else for (let k = 0; k < amount; k++) gains.push({ tile: t, playerId: s.owner, resource: randomResource(), amount: 1 })
        }
      })
      // Bacta-Klinik (science level 3): nothing produced → 1 resource of choice
      if (ck.value) {
        for (const p of players.value) {
          if (improvementsOf(p.id).science < 3 || gains.some(g => g.playerId === p.id)) continue
          if (isHuman(p.id)) addGold(p.id, 1)
          else applyGain(p.id, randomResource(), 1)
        }
      }
    }
    yieldEvent.value = { id: eventId(), sum, gains, tiles: flashed, blocked }
    if (env.autonomous) creditGains(gains)
  }

  function applyGain(playerId: string, resource: CardId, amount: number) {
    handOf(playerId)[resource] += amount
  }
  const creditGains = (gains: YieldGain[]) => { for (const g of gains) applyGain(g.playerId, g.resource, g.amount) }

  // --- pirates (Catan robber) ---------------------------------------------------
  /** A 7: everyone with more than 7 cards discards half, then the roller moves the pirates. */
  function startPirates() {
    const roller = activePlayer.value.id
    const discards: Record<string, number> = {}
    for (const p of players.value) {
      if (handSize(p.id) <= handLimit(p.id)) continue
      const lost = Math.floor(handSize(p.id) / 2)
      // human players choose their cards themselves
      if (isHuman(p.id)) {
        discards[p.id] = lost
        continue
      }
      const h = handOf(p.id)
      for (let i = 0; i < lost; i++) {
        const card = randomCard(h)
        if (card) h[card]--
      }
      notify({ title: `${p.name} wirft ${lost} Karten ab`, icon: 'i-lucide-trash-2', color: 'warning' })
    }
    if (Object.keys(discards).length) {
      pirates.value = { phase: 'discard', roller, discards, victims: [] }
      return
    }
    afterDiscard(roller)
  }

  /** After discarding: move the pirates – in Städte & Ritter only once the barbarians attacked for the first time. */
  function afterDiscard(roller: string) {
    if (ck.value && barbarians.value.attacks === 0) {
      pirates.value = null
      notify({ title: 'Die Piraten bleiben im Versteck', description: 'Sie werden erst nach dem ersten Angriff der Hutten-Armada aktiv.', icon: 'i-lucide-skull', color: 'neutral' })
      return
    }
    beginMove(roller)
  }

  function beginMove(roller: string) {
    pirates.value = { phase: 'move', roller, discards: {}, victims: [] }
    if (!isHuman(roller)) setTimeout(botMovePirates, 900)
  }

  /** A human player discards the selected cards (must match the required amount); the last one lets the pirates move. */
  function discardCards(pid: string, selection: Partial<Hand>) {
    const p = pirates.value
    const need = p?.phase === 'discard' ? p.discards[pid] ?? 0 : 0
    if (!p || need <= 0) return false
    const total = CARD_ORDER.reduce((a, r) => a + Math.max(0, selection[r] ?? 0), 0)
    if (total !== need || !hasCards(pid, selection)) return false
    for (const r of CARD_ORDER) handOf(pid)[r] -= Math.max(0, selection[r] ?? 0)
    const { [pid]: _done, ...rest } = p.discards
    if (Object.keys(rest).length) pirates.value = { ...p, discards: rest }
    else afterDiscard(p.roller)
    return true
  }

  /** Owners of structures around a tile. */
  const ownersAt = (t: number) => [...new Set(Object.values(board.value.corners)
    .filter(c => c.tiles.includes(t) && structures.value[c.id])
    .map(c => structures.value[c.id]!.owner))]

  /** Tiles the pirates may move to: any explored land tile except the current one (friendly rule optional). */
  function pirateTargets(): number[] {
    const land = tiles.value.flatMap((tile, t) => (tile.land && !tile.fog && t !== pirateTile.value ? [t] : []))
    if (!friendlyPirates.value) return land
    const weak = new Set(players.value.filter(p => stats(p).victoryPoints <= 2).map(p => p.id))
    const allowed = land.filter(t => !ownersAt(t).some(o => weak.has(o)))
    return allowed.length ? allowed : land
  }

  function movePirates(t: number) {
    const p = pirates.value
    if (p?.phase !== 'move' || !pirateTargets().includes(t)) return
    pirateTile.value = t
    const victims = ownersAt(t).filter(o => o !== p.roller && handSize(o) > 0)
    if (!victims.length) {
      pirates.value = null
      notify({ title: `${playerName(p.roller)} versetzt die Piraten`, description: 'Dort gibt es nichts zu holen.', icon: 'i-lucide-skull', color: 'neutral' })
    }
    else if (p.bishop) {
      for (const v of victims) {
        pirates.value = { ...p, phase: 'steal', victims }
        steal(v)
      }
    }
    else if (victims.length === 1) steal(victims[0]!)
    else if (isHuman(p.roller)) pirates.value = { ...p, phase: 'steal', victims }
    else steal(victims.sort((a, b) => handSize(b) - handSize(a))[0]!)
  }

  /** The roller steals one random card from `victim`. */
  function steal(victim: string) {
    const p = pirates.value
    if (!p) return
    const thief = p.roller
    pirates.value = null
    const card = randomCard(handOf(victim))
    if (!card) return
    handOf(victim)[card]--
    handOf(thief)[card]++
    notify(v => (v === thief
      ? { title: `Du stiehlst ${CARD_INFO[card].name} von ${playerName(victim)}`, icon: 'i-lucide-skull', color: 'success' }
      : v === victim
        ? { title: `${playerName(thief)} stiehlt dir ${CARD_INFO[card].name}`, icon: 'i-lucide-skull', color: 'error' }
        : { title: `${playerName(thief)} stiehlt eine Karte von ${playerName(victim)}`, icon: 'i-lucide-skull', color: 'warning' }))
  }

  /** Bot moves the pirates: easy = some opponent tile at random, otherwise the opponents' best tile. */
  function botMovePirates() {
    const p = pirates.value
    if (p?.phase !== 'move') return
    const targets = pirateTargets()
    const owners = (t: number) => ownersAt(t)
    const opponentTiles = targets.filter(t => owners(t).some(o => o !== p.roller) && !owners(t).includes(p.roller))
    let pick: number | undefined
    if (playerById(p.roller)?.difficulty === 'easy' || !opponentTiles.length) {
      const pool = opponentTiles.length ? opponentTiles : targets
      pick = pool[Math.floor(Math.random() * pool.length)]
    }
    else {
      const score = (t: number) => (PIPS[tiles.value[t]!.number ?? 0] ?? 0) * owners(t).length
      pick = opponentTiles.sort((a, b) => score(b) - score(a))[0]
    }
    if (pick !== undefined) movePirates(pick)
    else pirates.value = null
  }

  // --- trading ------------------------------------------------------------------
  /** Catan: only the active player trades, after rolling and outside the pirate sequence. */
  function canTrade(pid: string) {
    return !winner.value && activePlayer.value.id === pid && !!dice.value && !diceRoll.value && !pirates.value && !setup.value && !startRoll.value
  }

  const hasCards = (pid: string, part: Partial<Hand>) => CARD_ORDER.every(r => handOf(pid)[r] >= (part[r] ?? 0))
  /** Only known cards with positive whole counts (input from clients). */
  const cleanCards = (part: Partial<Hand>): Partial<Hand> =>
    Object.fromEntries(CARD_ORDER.filter(r => Number.isInteger(part[r]) && part[r]! > 0).map(r => [r, part[r]]))

  function moveCards(from: string, to: string, part: Partial<Hand>) {
    for (const r of CARD_ORDER) {
      handOf(from)[r] -= part[r] ?? 0
      handOf(to)[r] += part[r] ?? 0
    }
  }

  /** Trade stations at an own outpost/base. */
  const harborsOf = (pid: string) => harbors.value.filter(h => h.corners.some(c => structures.value[c]?.owner === pid))

  /**
   * Rate for giving a card: 4:1 bank, 3:1 at any station, 2:1 at the station of that resource.
   * Städte & Ritter: commodities 2:1 with the Handelsgilde (trade level 3).
   */
  function bankRate(pid: string, card: CardId) {
    const commodity = (COMMODITY_ORDER as CardId[]).includes(card)
    const guild = commodity && ck.value && improvementsOf(pid).trade >= 3 ? 2 : BANK_RATE
    const m = merchant.value
    if (m && m.owner === pid && tiles.value[m.tile]?.resource === card) return 2
    if (boosts.value.fleet === card && activePlayer.value.id === pid) return 2
    return Math.min(BANK_RATE, guild, ...harborsOf(pid).filter(h => !h.resource || h.resource === card).map(harborRate))
  }

  /** Maritime trade: `bankRate` cards of one kind for one card of another. */
  function bankTrade(pid: string, give: CardId, want: CardId) {
    const rate = bankRate(pid, give)
    if (!canTrade(pid) || give === want || !CARD_ORDER.includes(give) || !CARD_ORDER.includes(want) || handOf(pid)[give] < rate) return false
    handOf(pid)[give] -= rate
    handOf(pid)[want]++
    notify(v => (v === pid ? null : { title: `${playerName(pid)} handelt ${rate < BANK_RATE ? 'an einer Handelsstation' : 'mit der Bank'}`, description: `${rate} ${CARD_INFO[give].name} → 1 ${CARD_INFO[want].name}`, icon: 'i-lucide-landmark', color: 'neutral' }))
    return true
  }

  /** Offers a trade to all other players (`give` empty = request). Giving and wanting the same resource is not allowed. */
  function offerTrade(from: string, give: Partial<Hand>, want: Partial<Hand>) {
    if (!canTrade(from) || trade.value || !cardCount(want) || !hasCards(from, give)) return null
    if (CARD_ORDER.some(r => give[r] && want[r])) return null
    const offer: TradeOffer = {
      id: eventId(),
      from,
      give: cleanCards(give),
      want: cleanCards(want),
      // an offer a human player can't fulfill is not shown to them at all
      responses: Object.fromEntries(players.value.filter(p => p.id !== from)
        .map(p => [p.id, isHuman(p.id) && !hasCards(p.id, want) ? 'decline' as const : 'pending' as const])),
      counters: {},
      expiresAt: isHuman(from) ? null : Date.now() + 20000,
    }
    trade.value = offer
    return offer
  }

  function respondTrade(pid: string, accept: boolean) {
    const offer = trade.value
    if (offer?.responses[pid] !== 'pending') return
    // a request (nothing offered) can't simply be accepted, only answered with a counter offer
    offer.responses[pid] = accept && cardCount(offer.give) > 0 && hasCards(pid, offer.want) ? 'accept' : 'decline'
  }

  /** Counter offer: `pid` gives the wanted cards, but wants `cards` in return. */
  function counterTrade(pid: string, cards: Partial<Hand>) {
    const offer = trade.value
    if (offer?.responses[pid] !== 'pending' || !cardCount(cleanCards(cards)) || !hasCards(pid, offer.want)) return
    if (CARD_ORDER.some(r => cards[r] && offer.want[r])) return
    offer.counters[pid] = cleanCards(cards)
    offer.responses[pid] = 'counter'
  }

  /** What the offering player pays when dealing with `partner` (own offer or the partner's counter). */
  function dealPrice(offer: TradeOffer, partner: string): Partial<Hand> | null {
    if (offer.responses[partner] === 'accept') return offer.give
    if (offer.responses[partner] === 'counter') return offer.counters[partner] ?? null
    return null
  }

  /** The offering player closes the deal with a player who accepted or made a counter offer. */
  function completeTrade(partner: string) {
    const offer = trade.value
    const price = offer && dealPrice(offer, partner)
    if (!offer || !price) return false
    trade.value = null
    if (!hasCards(offer.from, price) || !hasCards(partner, offer.want)) return false
    moveCards(offer.from, partner, price)
    moveCards(partner, offer.from, offer.want)
    const deal = `${describeCards(price)} gegen ${describeCards(offer.want)}`
    notify((v) => {
      if (v !== offer.from && v !== partner) return { title: `${playerName(offer.from)} handelt mit ${playerName(partner)}`, description: deal, icon: 'i-lucide-arrow-left-right', color: 'neutral' }
      const other = v === offer.from ? partner : offer.from
      return { title: `Handel mit ${playerName(other)} abgeschlossen`, description: deal, icon: 'i-lucide-handshake', color: 'success' }
    })
    return true
  }

  function cancelTrade() {
    trade.value = null
  }

  // --- Städte & Ritter ----------------------------------------------------------------
  /** Event die: the barbarian fleet advances on a ship face; a gate draws progress cards. */
  function resolveEvent(value: number, red: number) {
    eventDie.value = value
    const face = eventFace(value)
    if (face !== 'ship') {
      // every player whose level fits the red die draws, starting with the active player
      const order = [...players.value.slice(activeIndex.value), ...players.value.slice(0, activeIndex.value)]
      for (const p of order) {
        if (drawsProgress(improvementsOf(p.id)[face], red)) drawProgress(p.id, face)
      }
      return
    }
    const step = barbarians.value.step + 1
    if (step < BARBARIAN_STEPS) {
      barbarians.value = { ...barbarians.value, step }
      if (step >= BARBARIAN_STEPS - 2) notify({ title: 'Die Hutten-Armada rückt näher', description: `Noch ${BARBARIAN_STEPS - step} Sprünge bis zum Angriff.`, icon: 'i-lucide-siren', color: 'warning' })
      return
    }
    barbarianAttack()
  }

  /** All cities (incl. metropolises) vs. all active knights. Then every knight is deactivated. */
  function barbarianAttack() {
    const strength = Object.values(structures.value).filter(s => s.kind === 'base').length
    const contrib = Object.fromEntries(players.value.map(p => [p.id, activeKnightStrength(p.id)]))
    const defense = Object.values(contrib).reduce((a, b) => a + b, 0)
    if (defense >= strength) {
      const best = Math.max(...Object.values(contrib))
      const heroes = players.value.filter(p => contrib[p.id] === best && best > 0)
      if (heroes.length === 1) {
        const hero = heroes[0]!
        defenderPoints.value = { ...defenderPoints.value, [hero.id]: (defenderPoints.value[hero.id] ?? 0) + 1 }
        notify(v => ({ title: 'Die Hutten-Armada ist zurückgeschlagen!', description: `${v === hero.id ? 'Du wirst' : `${hero.name} wird`} Verteidiger der Galaxis (+1 SP). Stärke ${strength} gegen Abwehr ${defense}.`, icon: 'i-lucide-shield-check', color: 'success' }))
      }
      else {
        notify({ title: 'Die Hutten-Armada ist zurückgeschlagen!', description: `Stärke ${strength} gegen Abwehr ${defense}. Gleichstand – die besten Verteidiger ziehen je eine Fortschrittskarte.`, icon: 'i-lucide-shield-check', color: 'success' })
        for (const h of heroes) {
          // deck of their best improvement track
          const lv = improvementsOf(h.id)
          const track = [...TRACK_ORDER].sort((a, b) => lv[b] - lv[a])[0]!
          drawProgress(h.id, track)
        }
      }
    }
    else {
      // the weakest defenders among players with an ordinary city (metropolises are safe) lose one city
      const exposed = players.value.filter(p => Object.entries(structures.value).some(([c, s]) => s.owner === p.id && s.kind === 'base' && !metropolisAt(c)))
      const weakest = Math.min(...exposed.map(p => contrib[p.id]!))
      const losers = exposed.filter(p => contrib[p.id] === weakest)
      const next = { ...structures.value }
      const lostWalls = new Set<string>()
      for (const p of losers) {
        const cities = Object.entries(next).filter(([c, s]) => s.owner === p.id && s.kind === 'base' && !metropolisAt(c))
        // prefer a city without shield generator
        const [corner] = cities.sort(([a], [b]) => Number(!!walls.value[a]) - Number(!!walls.value[b]))[0]!
        next[corner] = { ...next[corner]!, kind: 'outpost' }
        lostWalls.add(corner)
      }
      structures.value = next
      walls.value = Object.fromEntries(Object.entries(walls.value).filter(([c]) => !lostWalls.has(c)))
      notify({
        title: 'Die Hutten-Armada plündert die Galaxis!',
        description: `Stärke ${strength} gegen Abwehr ${defense}. ${losers.map(p => p.name).join(', ') || 'Niemand'} ${losers.length > 1 ? 'verlieren' : 'verliert'} eine Stadt.`,
        icon: 'i-lucide-flame',
        color: 'error',
      })
    }
    knights.value = Object.fromEntries(Object.entries(knights.value).map(([c, k]) => [c, { ...k, active: false }]))
    barbarians.value = { step: 0, attacks: barbarians.value.attacks + 1 }
  }

  /** Why `pid` can't do a knight action now (null = ok). */
  function knightBlocker(pid: string, corner: string, action: 'activate' | 'promote' | 'move' | 'chase'): string | null {
    const k = knights.value[corner]
    if (!ck.value || !k || k.owner !== pid) return 'Keine eigene Flotte'
    if (winner.value) return 'Das Spiel ist vorbei'
    if (activePlayer.value.id !== pid || setup.value || startRoll.value) return 'Nur in deinem Zug'
    if (pirates.value || diceRoll.value) return 'Erst die laufende Aktion abschließen'
    if (!dice.value) return 'Erst würfeln'
    if (action === 'activate') {
      if (k.active) return 'Bereits einsatzbereit'
      return canPayCost(pid, CK_COSTS.activate) ? null : `Kosten: 1 ${RESOURCES.food.name}`
    }
    if (action === 'promote') {
      if (k.level === 3) return 'Höchste Stufe erreicht'
      if (k.fresh) return 'Erst nächsten Zug wieder'
      if (k.level === 2 && improvementsOf(pid).politics < 3) return `Braucht ${TRACKS.politics.levels[2]} (Politik Stufe 3)`
      if (knightsOf(pid).filter(([, x]) => x.level === k.level + 1).length >= KNIGHT_PIECES) return `Keine ${KNIGHT_NAMES[(k.level + 1) as KnightLevel]} mehr übrig`
      return canPayCost(pid, CK_COSTS.promote) ? null : `Kosten: 1 ${RESOURCES.tibanna.name} + 1 ${RESOURCES.durasteel.name}`
    }
    if (!k.active) return 'Erst aktivieren (1 Nahrung)'
    if (k.fresh) return 'Erst nächsten Zug einsetzbar'
    if (action === 'move') return knightTargets(pid, corner).length ? null : 'Kein erreichbares Ziel'
    if (barbarians.value.attacks === 0) return 'Piraten erst nach dem ersten Angriff der Hutten-Armada aktiv'
    return board.value.corners[corner]!.tiles.includes(pirateTile.value) ? null : 'Nicht neben den Piraten'
  }

  const canPayCost = (pid: string, cost: Partial<Hand>) => Object.entries(cost).every(([r, n]) => handOf(pid)[r as CardId] >= n!)
  const payCost = (pid: string, cost: Partial<Hand>) => { for (const [r, n] of Object.entries(cost)) handOf(pid)[r as CardId] -= n! }

  function activateKnight(pid: string, corner: string) {
    if (knightBlocker(pid, corner, 'activate')) return false
    payCost(pid, CK_COSTS.activate)
    knights.value = { ...knights.value, [corner]: { ...knights.value[corner]!, active: true } }
    return true
  }

  function promoteKnight(pid: string, corner: string) {
    if (knightBlocker(pid, corner, 'promote')) return false
    payCost(pid, CK_COSTS.promote)
    const k = knights.value[corner]!
    knights.value = { ...knights.value, [corner]: { ...k, level: (k.level + 1) as KnightLevel, fresh: true } }
    notify(v => (v === pid ? null : { title: `${playerName(pid)} baut eine Flotte aus: ${KNIGHT_NAMES[(k.level + 1) as KnightLevel]}`, icon: 'i-lucide-chevrons-up', color: 'neutral' }))
    return true
  }

  /** Corners reachable along own routes from `from`, without passing opponent pieces. */
  function reachableCorners(pid: string, from: string) {
    const seen = new Set([from])
    const queue = [from]
    while (queue.length) {
      const c = queue.shift()!
      for (const e of board.value.corners[c]!.edges) {
        if (routes.value[e] !== pid) continue
        const edge = board.value.edges[e]!
        const n = edge.a === c ? edge.b : edge.a
        if (seen.has(n)) continue
        seen.add(n)
        if (!blockedFor(n, pid) && !knights.value[n]) queue.push(n) // can pass own structures
      }
    }
    seen.delete(from)
    return [...seen]
  }

  /** Where the knight on `from` may move: free corners on the own network, or onto a weaker opposing knight (displace). */
  function knightTargets(pid: string, from: string) {
    const k = knights.value[from]
    if (!k) return []
    return reachableCorners(pid, from).filter((c) => {
      if (structures.value[c]) return false
      const other = knights.value[c]
      return !other || (other.owner !== pid && other.level < k.level)
    })
  }

  /** Moves (or displaces with) an active knight. The knight is deactivated afterwards. */
  function moveKnight(pid: string, from: string, to: string) {
    if (knightBlocker(pid, from, 'move') || !knightTargets(pid, from).includes(to)) return false
    const k = knights.value[from]!
    const next = Object.fromEntries(Object.entries(knights.value).filter(([c]) => c !== from))
    const displaced = next[to]
    next[to] = { ...k, active: false }
    if (displaced) {
      // the displaced knight retreats to a free corner of its owner's network, otherwise it is lost
      const retreat = reachableCorners(displaced.owner, to).filter(c => !structures.value[c] && !next[c])
      const spot = retreat[Math.floor(Math.random() * retreat.length)]
      if (spot) next[spot] = displaced
      notify(v => ({
        title: `${playerName(pid)} verdrängt eine Flotte von ${playerName(displaced.owner)}`,
        description: spot ? 'Sie zieht sich zurück.' : 'Sie findet keinen Platz und wird aufgelöst.',
        icon: 'i-lucide-swords',
        color: v === displaced.owner ? 'error' : 'warning',
      }))
    }
    knights.value = next
    return true
  }

  /** An active knight next to the pirates chases them away: move them (and steal). */
  function chasePirates(pid: string, corner: string) {
    if (knightBlocker(pid, corner, 'chase')) return false
    knights.value = { ...knights.value, [corner]: { ...knights.value[corner]!, active: false } }
    notify(v => ({ title: `${v === pid ? 'Du vertreibst' : `${playerName(pid)} vertreibt`} die Piraten`, icon: 'i-lucide-swords', color: 'warning' }))
    beginMove(pid)
    return true
  }

  /** Why `pid` can't buy the next level of `track` (null = ok). */
  function improvementBlocker(pid: string, track: ImprovementTrack): string | null {
    if (!ck.value) return 'Nur mit Städte & Ritter'
    if (winner.value) return 'Das Spiel ist vorbei'
    if (activePlayer.value.id !== pid || setup.value || startRoll.value) return 'Nur in deinem Zug'
    if (pirates.value || diceRoll.value) return 'Erst die laufende Aktion abschließen'
    if (!dice.value) return 'Erst würfeln'
    const level = improvementsOf(pid)[track]
    if (level >= 5) return 'Höchste Stufe erreicht'
    if (!countStructures(pid, 'base')) return 'Du brauchst eine Stadt'
    const c = TRACKS[track].commodity
    if (handOf(pid)[c] < improvementCost(pid, track)) return `Kosten: ${improvementCost(pid, track)} ${COMMODITIES[c].name}`
    // level 4/5 may bring a metropolis: needs a city without one
    if (level + 1 >= 4 && metropolisWon(pid, track, level + 1) && !freeCityFor(pid)) return 'Keine Stadt frei für eine Metropole'
    return null
  }

  const freeCityFor = (pid: string) => Object.keys(structures.value).find(c => structures.value[c]!.owner === pid && structures.value[c]!.kind === 'base' && !metropolisAt(c))

  /** Reaching `level` in `track` wins the metropolis (first to 4, or 5 against a holder at 4). */
  function metropolisWon(pid: string, track: ImprovementTrack, level: number) {
    const at = metropolis.value[track]
    if (level < 4) return false
    if (!at) return true
    const holder = structures.value[at]?.owner
    return holder !== pid && level === 5 && improvementsOf(holder!)[track] < 5
  }

  /** Level n costs n commodities (Montagedroiden: 1 less, once). */
  function improvementCost(pid: string, track: ImprovementTrack) {
    const next = improvementsOf(pid)[track] + 1
    return Math.max(0, next - (boosts.value.crane && activePlayer.value.id === pid ? 1 : 0))
  }

  function buyImprovement(pid: string, track: ImprovementTrack) {
    if (improvementBlocker(pid, track)) return false
    const level = improvementsOf(pid)[track] + 1
    handOf(pid)[TRACKS[track].commodity] -= improvementCost(pid, track)
    if (boosts.value.crane) boosts.value = { ...boosts.value, crane: false }
    improvements.value = { ...improvements.value, [pid]: { ...improvementsOf(pid), [track]: level } }
    const name = TRACKS[track].levels[level - 1]
    if (metropolisWon(pid, track, level)) {
      const city = freeCityFor(pid)!
      const lostBy = metropolis.value[track] ? structures.value[metropolis.value[track]!]?.owner : null
      metropolis.value = { ...metropolis.value, [track]: city }
      notify(v => ({
        title: `${v === pid ? 'Deine' : `${playerName(pid)}s`} Stadt wird zur Metropole (${TRACKS[track].name})`,
        description: lostBy ? `${playerName(lostBy)} verliert die Metropole. +2 SP` : '+2 SP',
        icon: 'i-lucide-castle',
        color: v === pid ? 'success' : 'warning',
      }))
    }
    else {
      notify(v => (v === pid ? null : { title: `${playerName(pid)} baut aus: ${name}`, description: `${TRACKS[track].name} Stufe ${level}`, icon: 'i-lucide-building-2', color: 'neutral' }))
    }
    return true
  }

  // --- progress cards (Fortschrittskarten) -----------------------------------------------
  /** Draws the top card of `track`. Victory point cards are revealed at once; above 4 cards one must go. */
  function drawProgress(pid: string, track: ImprovementTrack) {
    const deck = progressDecks.value[track]
    if (!deck.length) return null
    const [card, ...rest] = deck
    progressDecks.value = { ...progressDecks.value, [track]: rest }
    const def = PROGRESS[card!.kind]
    if (def.victory) {
      progressVP.value = { ...progressVP.value, [pid]: [...(progressVP.value[pid] ?? []), card!.kind] }
      notify(v => ({ title: `${v === pid ? 'Du deckst' : `${playerName(pid)} deckt`} „${def.name}“ auf: +1 SP`, icon: 'i-lucide-crown', color: v === pid ? 'success' : 'warning' }))
      return card!
    }
    progressHands.value = { ...progressHands.value, [pid]: [...progressHand(pid), card!] }
    notify(v => (v === pid
      ? { title: `Fortschrittskarte: ${def.name}`, description: def.description, icon: def.icon, color: 'primary' }
      : { title: `${playerName(pid)} zieht eine Fortschrittskarte (${TRACKS[track].name})`, icon: 'i-lucide-scroll', color: 'neutral' }))
    if (progressHand(pid).length > PROGRESS_HAND_LIMIT) {
      if (isHuman(pid)) progressDiscard.value = { ...progressDiscard.value, [pid]: progressHand(pid).length - PROGRESS_HAND_LIMIT }
      else {
        const drop = progressHand(pid)[Math.floor(Math.random() * progressHand(pid).length)]!
        removeProgress(pid, drop.id, true)
      }
    }
    return card!
  }

  /** Removes a card from a hand; discarded cards go under their deck. */
  function removeProgress(pid: string, cardId: number, toDeck: boolean) {
    const card = progressHand(pid).find(c => c.id === cardId)
    if (!card) return null
    progressHands.value = { ...progressHands.value, [pid]: progressHand(pid).filter(c => c.id !== cardId) }
    if (toDeck) {
      const t = PROGRESS[card.kind].track
      progressDecks.value = { ...progressDecks.value, [t]: [...progressDecks.value[t], card] }
    }
    return card
  }

  /** A human player discards down to the limit of 4. */
  function discardProgress(pid: string, cardId: number) {
    if ((progressDiscard.value[pid] ?? 0) <= 0) return false
    if (!removeProgress(pid, cardId, true)) return false
    progressDiscard.value = { ...progressDiscard.value, [pid]: progressDiscard.value[pid]! - 1 }
    return true
  }

  const NUMBER_SWAP_FORBIDDEN = [2, 12, 6, 8]
  /** Routes with an end that has no other route / piece of their owner (Catan: open road). */
  function openRoutes() {
    return Object.entries(routes.value).filter(([e, owner]) => {
      const edge = board.value.edges[e]
      if (!edge) return false
      return [edge.a, edge.b].some((c) => {
        if (structures.value[c]?.owner === owner || knights.value[c]?.owner === owner) return false
        return !board.value.corners[c]!.edges.some(x => x !== e && routes.value[x] === owner)
      })
    }).map(([e]) => e)
  }

  /** Valid targets for a progress card's input (tiles, corners, edges or players). */
  function progressTargets(pid: string, kind: ProgressKind): { tiles?: number[], corners?: string[], edges?: string[], players?: string[] } {
    const others = players.value.filter(p => p.id !== pid)
    const myVP = stats(playerById(pid)!).victoryPoints
    const ownTiles = () => [...new Set(Object.values(board.value.corners)
      .filter(c => structures.value[c.id]?.owner === pid)
      .flatMap(c => c.tiles))].filter(t => tiles.value[t]?.resource && !tiles.value[t]?.fog)
    switch (kind) {
      case 'inventor':
        return { tiles: tiles.value.flatMap((t, i) => (t.number && !t.fog && !NUMBER_SWAP_FORBIDDEN.includes(t.number) ? [i] : [])) }
      case 'engineer': return { corners: validSites('wall', pid) }
      case 'medicine': return { corners: validSites('base', pid) }
      case 'smith': return { corners: knightsOf(pid).filter(([, k]) => k.level < (improvementsOf(pid).politics >= 3 ? 3 : 2) && knightsOf(pid).filter(([, x]) => x.level === k.level + 1).length < KNIGHT_PIECES).map(([c]) => c) }
      case 'merchant': return { tiles: ownTiles() }
      case 'masterMerchant': return { players: others.filter(p => stats(p).victoryPoints > myVP && handSize(p.id) > 0).map(p => p.id) }
      case 'spy': return { players: others.filter(p => progressHand(p.id).length > 0).map(p => p.id) }
      case 'deserter': return { players: others.filter(p => knightsOf(p.id).length > 0).map(p => p.id), corners: validSites('knight', pid) }
      case 'diplomat': return { edges: openRoutes() }
      case 'intrigue': return {
        corners: Object.entries(knights.value)
          .filter(([c, k]) => k.owner !== pid && board.value.corners[c]!.edges.some(e => routes.value[e] === pid))
          .map(([c]) => c),
      }
      default: return {}
    }
  }

  /** Why `pid` can't play this progress card now (null = ok). */
  function progressBlocker(pid: string, card: ProgressCard): string | null {
    const def = PROGRESS[card.kind]
    if (!ck.value) return 'Nur mit Städte & Ritter'
    if (winner.value) return 'Das Spiel ist vorbei'
    if (activePlayer.value.id !== pid || setup.value || startRoll.value) return 'Nur in deinem Zug'
    if (pirates.value || diceRoll.value) return 'Erst die laufende Aktion abschließen'
    if ((progressDiscard.value[pid] ?? 0) > 0) return 'Erst Karten abwerfen (höchstens 4)'
    if (def.beforeRoll && dice.value) return 'Nur vor dem Würfeln'
    if (!def.beforeRoll && !dice.value) return 'Erst würfeln'
    const t = progressTargets(pid, card.kind)
    switch (card.kind) {
      case 'inventor': return (t.tiles?.length ?? 0) >= 2 ? null : 'Keine tauschbaren Zahlen'
      case 'engineer': return t.corners?.length && wallCount(pid) < MAX_WALLS ? null : 'Keine Stadt ohne Schildgenerator'
      case 'medicine':
        if (!t.corners?.length || !piecesLeft(pid, BUILD_OPTIONS.find(o => o.id === 'base')!)) return 'Kein Außenposten zum Ausbauen'
        return canPayCost(pid, { durasteel: 2, food: 1 }) ? null : 'Kosten: 2 Durastahl + 1 Nahrung'
      case 'roadBuilding': return validSites('route', pid).length ? null : 'Kein Bauplatz für Routen'
      case 'smith': return t.corners?.length ? null : 'Keine Flotte zum Ausbauen'
      case 'merchant': return t.tiles?.length ? null : 'Kein System an deinen Docks'
      case 'masterMerchant': return t.players?.length ? null : 'Niemand mit mehr Siegpunkten und Karten'
      case 'spy': return t.players?.length ? null : 'Niemand hat Fortschrittskarten'
      case 'deserter': return t.players?.length ? null : 'Kein Mitspieler hat Flotten'
      case 'diplomat': return t.edges?.length ? null : 'Keine offene Route'
      case 'intrigue': return t.corners?.length ? null : 'Keine gegnerische Flotte an deinen Routen'
      case 'bishop': return barbarians.value.attacks > 0 ? null : 'Piraten erst nach dem ersten Angriff der Hutten-Armada aktiv'
      case 'crane': return countStructures(pid, 'base') ? null : 'Du brauchst eine Stadt'
      default: return null
    }
  }

  const cardsOf = (pid: string) => CARD_ORDER.filter(c => handOf(pid)[c] > 0)
  const takeRandom = (from: string, to: string, n: number) => {
    let taken = 0
    for (let i = 0; i < n; i++) {
      const c = randomCard(handOf(from))
      if (!c) break
      handOf(from)[c]--
      handOf(to)[c]++
      taken++
    }
    return taken
  }

  /** Plays a progress card with the given decisions. Returns false if not allowed / invalid. */
  function playProgress(pid: string, cardId: number, choice: ProgressChoice = {}) {
    const card = progressHand(pid).find(c => c.id === cardId)
    if (!card || progressBlocker(pid, card)) return false
    const def = PROGRESS[card.kind]
    const t = progressTargets(pid, card.kind)
    const who = (v: string | null) => (v === pid ? 'Du spielst' : `${playerName(pid)} spielt`)
    const others = players.value.filter(p => p.id !== pid)
    const myVP = stats(playerById(pid)!).victoryPoints
    // validate the decisions first
    switch (card.kind) {
      case 'alchemist': if (!choice.dice || choice.dice.length !== 2 || choice.dice.some(d => !Number.isInteger(d) || d < 1 || d > 6)) return false; break
      case 'inventor': if (choice.tiles?.length !== 2 || choice.tiles[0] === choice.tiles[1] || !choice.tiles.every(x => t.tiles!.includes(x))) return false; break
      case 'engineer': case 'medicine': case 'intrigue': if (!choice.corner || !t.corners!.includes(choice.corner)) return false; break
      case 'smith': if (!choice.corners?.length || choice.corners.length > 2 || !choice.corners.every(c => t.corners!.includes(c))) return false; break
      case 'merchant': if (choice.tiles?.length !== 1 || !t.tiles!.includes(choice.tiles[0]!)) return false; break
      case 'masterMerchant': if (!choice.player || !t.players!.includes(choice.player) || !choice.cards?.length || choice.cards.length > 2 || choice.cards.some(c => !CARD_ORDER.includes(c))) return false; break
      case 'spy': if (!choice.player || !t.players!.includes(choice.player) || !progressHand(choice.player).some(c => c.id === choice.progressId)) return false; break
      case 'deserter': if (!choice.player || !t.players!.includes(choice.player)) return false; break
      case 'diplomat': if (!choice.edge || !t.edges!.includes(choice.edge)) return false; break
      case 'merchantFleet': if (!choice.card || !CARD_ORDER.includes(choice.card)) return false; break
      case 'resourceMonopoly': if (!choice.card || !(RESOURCE_ORDER as CardId[]).includes(choice.card)) return false; break
      case 'tradeMonopoly': if (!choice.card || !(COMMODITY_ORDER as CardId[]).includes(choice.card)) return false; break
    }
    removeProgress(pid, cardId, true)
    let detail = ''

    switch (card.kind) {
      case 'alchemist':
        detail = `Produktionswürfel: ${choice.dice![0]} und ${choice.dice![1]}`
        rollDice(choice.dice)
        break
      case 'inventor': {
        const [a, b] = choice.tiles!
        const na = tiles.value[a!]!.number
        const nb = tiles.value[b!]!.number
        tiles.value = tiles.value.map((tile, i) => (i === a ? { ...tile, number: nb } : i === b ? { ...tile, number: na } : tile))
        detail = `Zahlen ${na} und ${nb} getauscht`
        break
      }
      case 'crane':
        boosts.value = { ...boosts.value, crane: true }
        detail = 'Nächster Stadtausbau 1 Ware günstiger'
        break
      case 'engineer':
        walls.value = { ...walls.value, [choice.corner!]: true }
        detail = 'Schildgenerator gebaut'
        break
      case 'irrigation': case 'mining': {
        const res: ResourceId = card.kind === 'irrigation' ? 'food' : 'durasteel'
        const n = [...new Set(Object.values(board.value.corners).filter(c => structures.value[c.id]?.owner === pid).flatMap(c => c.tiles))]
          .filter(x => tiles.value[x]?.resource === res).length
        applyGain(pid, res, 2 * n)
        detail = `+${2 * n} ${RESOURCES[res].name}`
        break
      }
      case 'medicine':
        payCost(pid, { durasteel: 2, food: 1 })
        structures.value = { ...structures.value, [choice.corner!]: { ...structures.value[choice.corner!]!, kind: 'base' } }
        detail = 'Außenposten zur Stadt ausgebaut'
        break
      case 'roadBuilding':
        freeRoutes.value = Math.min(2, 15 - countRoutes(pid))
        detail = '2 Routen gratis'
        break
      case 'smith':
        for (const c of choice.corners!) {
          const k = knights.value[c]!
          knights.value = { ...knights.value, [c]: { ...k, level: (k.level + 1) as KnightLevel } }
        }
        detail = `${choice.corners!.length} Flotte(n) ausgebaut`
        break
      case 'commercialHarbor': {
        let n = 0
        for (const o of others) {
          const commodity = COMMODITY_ORDER.filter(c => handOf(o.id)[c] > 0)[0]
          const give = [...RESOURCE_ORDER].sort((a, b) => handOf(pid)[b] - handOf(pid)[a])[0]!
          if (!commodity || handOf(pid)[give] <= 0) continue
          handOf(o.id)[commodity]--
          handOf(pid)[commodity]++
          handOf(pid)[give]--
          handOf(o.id)[give]++
          n++
        }
        detail = `${n} Ware(n) gegen Rohstoffe getauscht`
        break
      }
      case 'masterMerchant': {
        const from = choice.player!
        let n = 0
        for (const c of choice.cards!) {
          if (handOf(from)[c] <= 0) continue
          handOf(from)[c]--
          handOf(pid)[c]++
          n++
        }
        detail = `${n} Karten von ${playerName(from)}`
        break
      }
      case 'merchant': {
        const prev = merchant.value?.owner
        merchant.value = { tile: choice.tiles![0]!, owner: pid }
        const r = tiles.value[choice.tiles![0]!]!.resource!
        detail = `${RESOURCES[r].name} 2:1, +1 SP${prev && prev !== pid ? ` (${playerName(prev)} verliert den Konvoi)` : ''}`
        break
      }
      case 'merchantFleet':
        boosts.value = { ...boosts.value, fleet: choice.card! }
        detail = `${CARD_INFO[choice.card!].name} 2:1 in diesem Zug`
        break
      case 'resourceMonopoly': case 'tradeMonopoly': {
        const max = card.kind === 'resourceMonopoly' ? 2 : 1
        let total = 0
        for (const o of others) {
          const n = Math.min(max, handOf(o.id)[choice.card!])
          handOf(o.id)[choice.card!] -= n
          total += n
          if (n) notify(v => (v === o.id ? { title: `${def.name}: du gibst ${n} ${CARD_INFO[choice.card!].name}`, icon: def.icon, color: 'error' } : null))
        }
        applyGain(pid, choice.card!, total)
        detail = `+${total} ${CARD_INFO[choice.card!].name}`
        break
      }
      case 'bishop':
        pirates.value = { phase: 'move', roller: pid, discards: {}, victims: [], bishop: true }
        if (!isHuman(pid)) setTimeout(botMovePirates, 900)
        detail = 'Piraten versetzen, von allen dort stehlen'
        break
      case 'deserter': {
        const victim = choice.player!
        const [vc, vk] = knightsOf(victim).sort(([, a], [, b]) => a.level - b.level)[0]!
        knights.value = Object.fromEntries(Object.entries(knights.value).filter(([c]) => c !== vc))
        const spot = choice.corner && validSites('knight', pid).includes(choice.corner) ? choice.corner : validSites('knight', pid)[0]
        const free = knightsOf(pid).filter(([, k]) => k.level === vk.level).length < KNIGHT_PIECES
        if (spot && free) knights.value = { ...knights.value, [spot]: { owner: pid, level: vk.level, active: false, fresh: true } }
        detail = `${playerName(victim)} verliert eine ${KNIGHT_NAMES[vk.level]}${spot && free ? ' – sie läuft zu dir über' : ''}`
        break
      }
      case 'diplomat': {
        const owner = routes.value[choice.edge!]!
        routes.value = Object.fromEntries(Object.entries(routes.value).filter(([e]) => e !== choice.edge))
        if (owner === pid) freeRoutes.value = Math.max(freeRoutes.value, 1)
        detail = owner === pid ? 'Eigene Route entfernt – neu setzen' : `Route von ${playerName(owner)} entfernt`
        break
      }
      case 'intrigue': {
        const target = knights.value[choice.corner!]!
        const next = Object.fromEntries(Object.entries(knights.value).filter(([c]) => c !== choice.corner))
        const retreat = reachableCorners(target.owner, choice.corner!).filter(c => !structures.value[c] && !next[c])
        const spot = retreat[Math.floor(Math.random() * retreat.length)]
        if (spot) next[spot] = target
        knights.value = next
        detail = `Flotte von ${playerName(target.owner)} ${spot ? 'verdrängt' : 'aufgelöst'}`
        break
      }
      case 'saboteur': {
        const hit = others.filter(o => stats(o).victoryPoints >= myVP)
        for (const o of hit) {
          const lost = Math.floor(handSize(o.id) / 2)
          for (let i = 0; i < lost; i++) {
            const c = randomCard(handOf(o.id))
            if (c) handOf(o.id)[c]--
          }
          if (lost) notify(v => (v === o.id ? { title: `Saboteur: du verlierst ${lost} Karten`, icon: def.icon, color: 'error' } : null))
        }
        detail = hit.length ? `${hit.map(o => o.name).join(', ')} verlieren die Hälfte ihrer Karten` : 'Niemand betroffen'
        break
      }
      case 'spy': {
        const stolen = removeProgress(choice.player!, choice.progressId!, false)!
        progressHands.value = { ...progressHands.value, [pid]: [...progressHand(pid), stolen] }
        notify(v => (v === choice.player ? { title: `Spion: ${playerName(pid)} nimmt dir „${PROGRESS[stolen.kind].name}“`, icon: def.icon, color: 'error' } : null))
        detail = `Fortschrittskarte von ${playerName(choice.player!)}`
        break
      }
      case 'warlord':
        knights.value = Object.fromEntries(Object.entries(knights.value).map(([c, k]) => [c, k.owner === pid ? { ...k, active: true } : k]))
        detail = 'Alle Flotten aktiviert'
        break
      case 'wedding': {
        let n = 0
        for (const o of others.filter(o => stats(o).victoryPoints > myVP)) {
          const got = takeRandom(o.id, pid, 2)
          n += got
          if (got) notify(v => (v === o.id ? { title: `Allianz: du gibst ${playerName(pid)} ${got} Karten`, icon: def.icon, color: 'error' } : null))
        }
        detail = `+${n} Karten`
        break
      }
    }
    notify(v => ({ title: `${who(v)} ${def.name}`, description: detail, icon: def.icon, color: v === pid ? 'success' : 'warning' }))
    return true
  }

  /**
   * Stations of a game generated before the corner fix can sit inside the map: place them anew.
   * Not on fog maps, where explored fog may legitimately turn a coast into land.
   */
  function repairHarbors() {
    if (template.value.fog || harborsValid(board.value, harbors.value)) return
    harbors.value = generateHarbors(tiles.value, template.value.harbors)
  }

  // --- new game ---------------------------------------------------------------
  /** Starts a fresh game with a newly generated map. */
  function startNewGame(config: NewGameConfig) {
    // reset (not clear) transient state, so components holding these refs keep valid values
    diceRoll.value = null
    yieldEvent.value = null
    rollLog.value = []
    gameId.value = crypto.randomUUID()
    botBusy.value = false
    mapId.value = config.mapId
    tiles.value = generateMap(config.mapId)
    harbors.value = generateHarbors(tiles.value, templateById(config.mapId).harbors)
    pirateTile.value = emptyTile(tiles.value)
    goldPicks.value = {}
    if (config.players?.length) players.value = config.players
    hands.value = Object.fromEntries(players.value.map(p => [p.id, emptyHand()]))
    victoryGoal.value = config.victoryPoints ?? templateById(config.mapId).victoryPoints + (config.citiesKnights ? CK_VICTORY_BONUS : 0)
    turn.value = 1
    dice.value = null
    structures.value = {}
    routes.value = {}
    pirates.value = null
    trade.value = null
    devDeck.value = newDevDeck()
    devCards.value = {}
    devPlayed.value = false
    freeRoutes.value = 0
    winner.value = null
    players.value = players.value.map(p => ({ ...p, fleetStrength: 0 }))
    ck.value = config.citiesKnights ?? false
    improvements.value = {}
    metropolis.value = { trade: null, politics: null, science: null }
    walls.value = {}
    knights.value = {}
    barbarians.value = { step: 0, attacks: 0 }
    defenderPoints.value = {}
    eventDie.value = null
    progressDecks.value = newProgressDecks()
    progressHands.value = {}
    progressVP.value = {}
    merchant.value = null
    boosts.value = { crane: false, fleet: null }
    progressDiscard.value = {}
    setup.value = null
    friendlyPirates.value = config.friendlyPirates ?? false
    if (config.randomStart) {
      activeIndex.value = 0
      startRoll.value = { phase: 'pending', round: 1, results: [], current: null, winner: null }
    }
    else {
      startRoll.value = null
      beginSetup(0)
    }
  }

  // --- turn flow --------------------------------------------------------------
  function logRoll(index: number, player: GamePlayer, r: RollResult, rollTurn: number, forced = false) {
    rollLog.value = [...rollLog.value, {
      index,
      turn: rollTurn,
      playerId: player.id,
      playerName: player.name,
      values: r.values,
      ...(r.event ? { event: r.event } : {}),
      ...(forced ? { forced: true } : {}),
      source: r.source,
      fallback: r.fallback,
      at: new Date().toISOString(),
      proof: r.proof,
    }]
  }

  /** Runs the start roll ceremony (logged as turn 0); the highest sum starts, ties roll again. Then setup begins. */
  async function runStartRoll() {
    const st = startRoll.value
    if (st?.phase !== 'pending') return
    st.phase = 'rolling'
    let contenders = players.value.map(p => p.id)
    for (let round = 1; ; round++) {
      st.round = round
      for (const pid of contenders) {
        st.current = pid
        st.results.push({ playerId: pid, round, values: null })
        const index = rollLog.value.length + 1
        const [r] = await Promise.all([env.roll(index, 2), wait(900)])
        logRoll(index, playerById(pid)!, r, 0)
        st.results = st.results.map(e => (e.playerId === pid && e.round === round ? { ...e, values: r.values } : e))
        await wait(500)
      }
      const sums = contenders.map((pid) => {
        const v = st.results.find(e => e.playerId === pid && e.round === round)!.values!
        return { pid, sum: v[0] + v[1] }
      })
      const best = Math.max(...sums.map(x => x.sum))
      contenders = sums.filter(x => x.sum === best).map(x => x.pid)
      if (contenders.length === 1) break
    }
    st.current = null
    st.winner = contenders[0]!
    st.phase = 'done'
    await wait(2600)
    if (startRoll.value !== st) return // a new game was started meanwhile
    startRoll.value = null
    beginSetup(players.value.findIndex(p => p.id === st.winner))
  }

  /** `forced`: production dice chosen with the Wahrscheinlichkeitsdroide (Catan: Alchemist). */
  async function rollDice(forced?: [number, number]) {
    if (winner.value || diceRoll.value || dice.value || pirates.value || startRoll.value || setup.value) return
    const id = eventId()
    diceRoll.value = { id, values: null }
    const player = activePlayer.value
    const index = rollLog.value.length + 1
    const raw = await env.roll(index, ck.value ? 3 : 2)
    const r = forced ? { ...raw, values: forced } : raw
    logRoll(index, player, r, turn.value, !!forced)
    if (diceRoll.value?.id !== id) return
    diceRoll.value = { id, values: r.values, ...(r.event ? { event: r.event } : {}) }
    // server: commit after the clients' dice animation (in the browser DiceRoll.vue commits)
    if (env.autonomous) {
      await wait(ROLL_COMMIT_MS)
      if (diceRoll.value?.id === id) commitRoll(r.values, r.event)
    }
  }

  /** The rolled dice count: production (or the pirates on a 7). */
  function commitRoll(values: [number, number], event?: number) {
    dice.value = values
    diceRoll.value = null
    produce(values[0] + values[1], event, values[1])
  }

  function endTurn() {
    if (winner.value || pirates.value || startRoll.value || setup.value || !dice.value) return
    // cards bought this turn become playable from the player's next turn
    const pid = activePlayer.value.id
    if (devHand(pid).some(c => c.fresh)) devCards.value = { ...devCards.value, [pid]: devHand(pid).map(c => ({ ...c, fresh: false })) }
    devPlayed.value = false
    freeRoutes.value = 0
    // knights built, promoted or activated this turn may act from the next turn on
    if (knightsOf(pid).some(([, k]) => k.fresh)) {
      knights.value = Object.fromEntries(Object.entries(knights.value).map(([c, k]) => [c, k.owner === pid ? { ...k, fresh: false } : k]))
    }
    eventDie.value = null
    boosts.value = { crane: false, fleet: null }
    activeIndex.value = (activeIndex.value + 1) % players.value.length
    if (activeIndex.value === startIndex.value) turn.value++
    dice.value = null
    trade.value = null
  }

  return {
    env, gameId, botBusy, isHuman, playerById, buildAs, commitRoll,
    mapId, tiles, board, template, goldPicks, chooseGold, bonusIslands, startNewGame,
    startRoll, runStartRoll, setup, startIndex,
    trade, canTrade, hasCards, bankRate, bankTrade, offerTrade, respondTrade, counterTrade, dealPrice, completeTrade, cancelTrade,
    harbors, harborsOf, repairHarbors,
    ck, improvements, improvementsOf, metropolis, metropolisAt, metropolisesOf, walls, knights, knightsOf, barbarians, defenderPoints, eventDie,
    handLimit, knightBlocker, activateKnight, promoteKnight, knightTargets, moveKnight, chasePirates, improvementBlocker, buyImprovement,
    activeKnightStrength, canPayCost,
    progressDecks, progressHands, progressHand, progressVP, merchant, boosts, progressDiscard, discardProgress,
    progressTargets, progressBlocker, playProgress, improvementCost, cardsOf,
    pirates, pirateTargets, movePirates, discardCards, steal, handSize,
    rollLog, players, activeIndex, activePlayer, myTurn, turn, victoryGoal, dice, diceRoll, hands, resources,
    structures, routes, pirateTile, yieldEvent, piecesUsed, me, longestRouteHolder, largestFleetHolder,
    devDeck, devCards, devHand, devPlayed, freeRoutes, devCardBlocker, playDevCard, winner, checkVictory,
    stats, isFree, validSites, canPay, canAfford, piecesLeft, buildBlocker, build, buyActionCard, produce, applyGain, rollDice, endTurn,
  }
}

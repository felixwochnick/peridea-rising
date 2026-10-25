import type { EffectScope } from 'vue'
import type { ShipType } from '~/components/Ship.vue'

// The game for the HUD: the shared engine (shared/utils/game.ts) on Nuxt state, plus UI state
// (selected build, notices). Solo games run the engine right here; in a multiplayer game the state
// comes from the server and every action is sent there instead (see useMultiplayer).

/** Models: Dorf / Stadt / Metropole = Light / Medium / Warship Dockyard. */
export const SIDE_SHIPS: Record<Side, { outpost: ShipType, base: ShipType, metropolis: ShipType }> = {
  rebel: { outpost: 'rebel-dock-1', base: 'rebel-dock-2', metropolis: 'rebel-dock-3' },
  empire: { outpost: 'empire-dock-1', base: 'empire-dock-2', metropolis: 'empire-dock-3' },
}
/** Städte & Ritter knights: fighter squadron, corvette, capital ship. */
export const SIDE_KNIGHTS: Record<Side, Record<KnightLevel, ShipType>> = {
  rebel: { 1: 'rebel-xwing', 2: 'rebel-corvette', 3: 'rebel-cruiser' },
  empire: { 1: 'empire-tie', 2: 'empire-gozanti', 3: 'empire-destroyer' },
}

let noticeSeq = 0

function createClientGame() {
  const mp = useMultiplayer()
  const diceSource = useDiceSource()
  /** Queue of HUD messages, drained by GameNotifier. */
  const notices = useState<GameNotice[]>('gc-notices', () => [])
  const selectedBuild = useState<BuildId | null>('gc-build', () => null)
  const players = useState<GamePlayer[] | undefined>('gc-players')
  /** Multiplayer: my seat; solo: the human player. */
  const viewer = () => mp.seatId.value ?? players.value?.find(p => p.kind === 'human')?.id ?? null

  const g = createGame({
    state: (key, init) => useState(key, init),
    viewer,
    roll: (index, count) => diceSource.roll(index, count),
    notify: (n) => {
      const shown = renderNotice(n, viewer())
      if (shown) notices.value = [...notices.value, { id: Date.now() * 1000 + (noticeSeq++ % 1000), ...shown }]
    },
    autonomous: false,
  })

  /** The game runs on the server: actions are sent, not executed. */
  const remote = mp.inGame
  const meId = () => viewer() ?? ''
  const send = (name: string, ...args: unknown[]) => {
    mp.send('action', { name, args })
    return true as const
  }

  /** The local player's open decisions. */
  const goldPicks = computed(() => g.goldPicks.value[meId()] ?? 0)
  const progressDiscard = computed(() => g.progressDiscard.value[meId()] ?? 0)
  const pirateDiscard = computed(() => (g.pirates.value?.phase === 'discard' ? g.pirates.value.discards[meId()] ?? 0 : 0))

  /** Places the selected build at a corner / edge. */
  function place(siteId: string) {
    const id = selectedBuild.value
    const option = BUILD_OPTIONS.find(o => o.id === id)
    if (!id || id === 'action' || !option || g.buildBlocker(option)) return null
    const result = remote.value ? send('build', id, siteId) : g.build(meId(), id, siteId)
    if (result) selectedBuild.value = null
    return result
  }

  function startNewGame(config: NewGameConfig) {
    notices.value = []
    selectedBuild.value = null
    useYieldFlights().value = []
    g.startNewGame(config)
  }

  return {
    ...g,
    /** The engine itself (solo: bots and the game driver work on it directly). */
    engine: g,
    remote, notices, selectedBuild, goldPicks, progressDiscard, pirateDiscard, place, startNewGame,
    build: (pid: string, kind: Exclude<BuildId, 'action'>, site: string) => (remote.value ? send('build', kind, site) : g.build(pid, kind, site)),
    buyActionCard: (pid = meId()) => (remote.value ? send('buyActionCard') : g.buyActionCard(pid)),
    rollDice: (forced?: [number, number]) => (remote.value ? send('rollDice') : g.rollDice(forced)),
    endTurn: () => (remote.value ? send('endTurn') : g.endTurn()),
    chooseGold: (res: ResourceId) => (remote.value ? send('chooseGold', res) : g.chooseGold(meId(), res)),
    discardCards: (selection: Partial<Hand>) => (remote.value ? send('discardCards', selection) : g.discardCards(meId(), selection)),
    movePirates: (tile: number) => (remote.value ? send('movePirates', tile) : g.movePirates(tile)),
    steal: (victim: string) => (remote.value ? send('steal', victim) : g.steal(victim)),
    bankTrade: (pid: string, give: CardId, want: CardId) => (remote.value ? send('bankTrade', give, want) : g.bankTrade(pid, give, want)),
    offerTrade: (from: string, give: Partial<Hand>, want: Partial<Hand>) => (remote.value ? send('offerTrade', give, want) : g.offerTrade(from, give, want)),
    respondTrade: (pid: string, accept: boolean) => (remote.value ? send('respondTrade', accept) : g.respondTrade(pid, accept)),
    counterTrade: (pid: string, cards: Partial<Hand>) => (remote.value ? send('counterTrade', cards) : g.counterTrade(pid, cards)),
    completeTrade: (partner: string) => (remote.value ? send('completeTrade', partner) : g.completeTrade(partner)),
    cancelTrade: () => (remote.value ? send('cancelTrade') : g.cancelTrade()),
    playDevCard: (pid: string, cardId: number, choice: ResourceId[] = []) => (remote.value ? send('playDevCard', cardId, choice) : g.playDevCard(pid, cardId, choice)),
    activateKnight: (pid: string, corner: string) => (remote.value ? send('activateKnight', corner) : g.activateKnight(pid, corner)),
    promoteKnight: (pid: string, corner: string) => (remote.value ? send('promoteKnight', corner) : g.promoteKnight(pid, corner)),
    chasePirates: (pid: string, corner: string) => (remote.value ? send('chasePirates', corner) : g.chasePirates(pid, corner)),
    moveKnight: (pid: string, from: string, to: string) => (remote.value ? send('moveKnight', from, to) : g.moveKnight(pid, from, to)),
    buyImprovement: (pid: string, track: ImprovementTrack) => (remote.value ? send('buyImprovement', track) : g.buyImprovement(pid, track)),
    playProgress: (pid: string, cardId: number, choice: ProgressChoice = {}) => (remote.value ? send('playProgress', cardId, choice) : g.playProgress(pid, cardId, choice)),
    discardProgress: (cardId: number) => (remote.value ? send('discardProgress', cardId) : g.discardProgress(meId(), cardId)),
    // the server credits production and commits the dice itself
    applyGain: (pid: string, resource: CardId, amount: number) => { if (!remote.value) g.applyGain(pid, resource, amount) },
    commitRoll: (values: [number, number], event?: number) => { if (!remote.value) g.commitRoll(values, event) },
    runStartRoll: () => (remote.value ? Promise.resolve() : g.runStartRoll()),
    checkVictory: () => { if (!remote.value) g.checkVictory() },
    repairHarbors: () => { if (!remote.value) g.repairHarbors() },
  }
}

export type ClientGame = ReturnType<typeof createClientGame>

type AppWithGame = ReturnType<typeof useNuxtApp> & { _galactic?: { game: ClientGame, scope: EffectScope } }

/** The game of this app instance (created once, outlives the components that use it). */
export function useGalacticGame(): ClientGame {
  const nuxtApp = useNuxtApp() as AppWithGame
  if (nuxtApp._galactic) return nuxtApp._galactic.game
  const scope = effectScope(true)
  // called within the Nuxt context (useNuxtApp above), which createClientGame needs for useState
  const game = scope.run(createClientGame)!
  nuxtApp._galactic = { game, scope }
  return game
}

/** Drops the game (after its state was cleared): the next `useGalacticGame()` starts on fresh state. */
export function disposeGalacticGame() {
  const nuxtApp = useNuxtApp() as AppWithGame
  nuxtApp._galactic?.scope.stop()
  nuxtApp._galactic = undefined
}

// Computer opponents. Currently one strategy: the easy bot.
// Normal/hard bots and AI players (Gemini/Claude/GPT) use it as a placeholder for now.
//
// Easy bot:
// - Setup: picks one of the better build sites, not necessarily the best.
// - Turn: rolls, then builds at most two things it can afford (base > outpost > route),
//   sometimes skipping a possible build. No action cards.
// - Trading: picks the build it is closest to, offers 1:1 trades for a missing card
//   (sometimes) and trades surplus with the bank / its trade stations (4:1, 3:1, 2:1).
//   Accepts offers that help it (a bit generously), answers requests with counter
//   offers, but never helps a player close to victory.
// - Action cards: plays a Flottenverband before rolling when the pirates block one of its
//   systems (sometimes just like that), Schmugglerfund / Handelsembargo / Hyperraumvermessung
//   when they help with the next build; buys cards when there is nothing else to build.
// - Städte & Ritter: buys city improvements with its commodities, builds and activates fleets
//   when the Hutten-Armada comes close, sometimes shield generators, chases the pirates away.
// - Pirates (7): moves them to a random opponent system, discards random cards.

import { watch } from 'vue'
import { TRACK_ORDER, TRACKS } from './citiesKnights'
import type { DevCardKind } from './devCards'
import { BUILD_OPTIONS, cardCount, emptyHand, PIPS, type BuildId, type GalacticGame, type Hand, type ProgressChoice, type TradeOffer } from './game'
import type { ProgressKind } from './progressCards'
import { CARD_ORDER, COMMODITY_ORDER, RESOURCE_ORDER, type ResourceId } from './resources'

type BuildKind = 'route' | 'outpost' | 'base'
interface BuildPlan {
  kind: BuildKind
  /** Cards still missing for the build (one entry per card). */
  missing: ResourceId[]
  /** Cards not needed for the build. */
  surplus: Hand
}

export interface BotOptions {
  /** Shorter pauses (reduced motion). */
  fast?: () => boolean
}

export type BotPlayer = ReturnType<typeof createBot>

export function createBot(g: GalacticGame, options: BotOptions = {}) {
  /** A bot is currently acting (prevents overlapping turns). */
  const busy = g.botBusy

  const sleep = (ms: number) => new Promise(r => setTimeout(r, options.fast?.() ? ms / 3 : ms))
  const pick = <T>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)]

  /** Resolves once `cond` is true (or after `timeout` ms). */
  function waitUntil(cond: () => boolean, timeout = 30000) {
    return new Promise<void>((resolve) => {
      if (cond()) return resolve()
      const stop = watch(cond, (ok) => {
        if (!ok) return
        stop()
        clearTimeout(t)
        resolve()
      })
      const t = setTimeout(() => { stop(); resolve() }, timeout)
    })
  }

  /** How good a corner is: pips of adjacent systems, a bonus for resource variety, gold counts extra. */
  function cornerValue(cornerId: string) {
    const corner = g.board.value.corners[cornerId]!
    const kinds = new Set<string>()
    let value = 0
    for (const t of corner.tiles) {
      const tile = g.tiles.value[t]!
      const pips = PIPS[tile.number ?? 0] ?? 0
      if (t === g.pirateTile.value) continue
      if (tile.resource) {
        value += pips
        kinds.add(tile.resource)
      }
      else if (tile.gold) value += pips * 1.2
      else if (tile.fog) value += 0.5 // curiosity
    }
    // trade stations: 3:1 always useful, 2:1 a bit more
    const harbor = g.harbors.value.find(h => h.corners.includes(cornerId))
    const harborBonus = harbor ? (harbor.resource ? 1.5 : 1.2) : 0
    return value + kinds.size * 1.5 + harborBonus
  }

  /** Easy: a random one of the top `n` options. */
  const oneOfBest = <T>(items: T[], score: (x: T) => number, n: number) =>
    pick([...items].sort((a, b) => score(b) - score(a)).slice(0, n))

  // --- setup -----------------------------------------------------------------
  async function setupTurn(pid: string) {
    busy.value = true
    try {
      await sleep(1100)
      const site = oneOfBest(g.validSites('outpost', pid), cornerValue, 6)
      if (site) g.build(pid, 'outpost', site)
      await sleep(900)
      // route: towards the better free corner
      const routes = g.validSites('route', pid)
      const target = oneOfBest(routes, e => routeValue(e, pid), 2)
      if (target) g.build(pid, 'route', target)
    }
    finally {
      busy.value = false
    }
  }

  /** Value of a route: how good the corner it leads to would be for a future outpost. */
  function routeValue(edgeId: string, pid: string) {
    const edge = g.board.value.edges[edgeId]!
    const s = g.structures.value
    const ends = [edge.a, edge.b].filter(c => !(s[c]?.owner === pid))
    return Math.max(0, ...ends.map((c) => {
      const corner = g.board.value.corners[c]!
      const buildable = !s[c] && corner.neighbors.every(n => !s[n])
      // a corner one step further also counts a bit
      const next = Math.max(0, ...corner.neighbors.filter(n => !s[n]).map(n => cornerValue(n) * 0.5))
      return (buildable ? cornerValue(c) : 0) + next
    }))
  }

  // --- trading -----------------------------------------------------------------
  /** The build the bot works towards: the one with the fewest missing cards (base > outpost > route on ties). */
  function buildPlan(pid: string): BuildPlan | null {
    const hand = g.hands.value[pid] ?? emptyHand()
    const kinds: BuildKind[] = ['base', 'outpost', 'route']
    const plans = kinds.flatMap((kind) => {
      const option = BUILD_OPTIONS.find(o => o.id === kind)!
      if (!g.piecesLeft(pid, option) || !g.validSites(kind, pid).length) return []
      // routes only when they are needed to reach a new outpost site
      if (kind === 'route' && g.validSites('outpost', pid).length) return []
      const missing = RESOURCE_ORDER.flatMap(r => Array<ResourceId>(Math.max(0, (option.cost[r] ?? 0) - hand[r])).fill(r))
      const surplus = Object.fromEntries(RESOURCE_ORDER.map(r => [r, Math.max(0, hand[r] - (option.cost[r] ?? 0))])) as Hand
      return [{ kind, missing, surplus }]
    })
    return plans.sort((a, b) => a.missing.length - b.missing.length)[0] ?? null
  }

  /** How good it is for `pid` to receive `receive` and pay `pay` (> 0 = good). */
  function tradeScore(pid: string, receive: Partial<Hand>, pay: Partial<Hand>) {
    const plan = buildPlan(pid)
    const needed = new Map<ResourceId, number>()
    for (const r of plan?.missing ?? []) needed.set(r, (needed.get(r) ?? 0) + 1)
    let score = 0
    for (const r of RESOURCE_ORDER) {
      const n = receive[r] ?? 0
      const useful = Math.min(n, needed.get(r) ?? 0)
      score += useful * 2 + (n - useful)
      const m = pay[r] ?? 0
      const spare = Math.min(m, plan?.surplus[r] ?? m)
      score -= spare + (m - spare) * 2.5
    }
    return score
  }

  const nearVictory = (pid: string) => {
    const p = g.players.value.find(x => x.id === pid)
    return !!p && g.stats(p).victoryPoints >= g.victoryGoal.value - 2
  }

  /** Should bot `pid` accept the open offer? It receives `offer.give` and pays `offer.want`. */
  function wantsOffer(pid: string, offer: TradeOffer) {
    if (!g.hasCards(pid, offer.want) || !cardCount(offer.give) || nearVictory(offer.from)) return false
    return tradeScore(pid, offer.give, offer.want) + (Math.random() * 1.5 - 0.5) >= 0 // easy: a bit generous, a bit moody
  }

  /** Counter offer of bot `pid`: same number of cards as asked, preferably ones it needs. Null = no deal. */
  function counterFor(pid: string, offer: TradeOffer): Partial<Hand> | null {
    if (!g.hasCards(pid, offer.want) || nearVictory(offer.from)) return null
    const hand = g.hands.value[pid]!
    const n = cardCount(offer.want)
    const allowed = (r: ResourceId) => !offer.want[r]
    const wishes = (buildPlan(pid)?.missing ?? []).filter(allowed)
    // fill up with what it has the least of
    const fill = RESOURCE_ORDER.filter(allowed).sort((a, b) => hand[a] - hand[b] + (Math.random() - 0.5))
    const cards: Partial<Hand> = {}
    for (let i = 0; i < n; i++) {
      const r = wishes[i] ?? fill[i % Math.max(1, fill.length)]
      if (r) cards[r] = (cards[r] ?? 0) + 1
    }
    if (!cardCount(cards)) return null
    return tradeScore(pid, cards, offer.want) + Math.random() * 1.5 >= 0 ? cards : null
  }

  /** Bots answer an open offer after a short "thinking" pause: accept, counter or decline. */
  function answerOffer(offer: TradeOffer) {
    for (const pid of Object.keys(offer.responses)) {
      if (g.players.value.find(p => p.id === pid)?.kind === 'human') continue
      setTimeout(() => {
        const open = g.trade.value
        if (open?.id !== offer.id || open.responses[pid] !== 'pending') return
        if (wantsOffer(pid, open)) return g.respondTrade(pid, true)
        const counter = counterFor(pid, open)
        if (counter) g.counterTrade(pid, counter)
        else g.respondTrade(pid, false)
      }, 600 + Math.random() * 1400)
    }
  }

  /** The bot's trades before building: one 1:1 offer for a missing card, then bank trades. */
  async function tradeForBuild(pid: string) {
    let plan = buildPlan(pid)
    if (!plan?.missing.length) return
    const hand = () => g.hands.value[pid]!

    // 1:1 offer to the other players (easy: not always)
    const spare = RESOURCE_ORDER.filter(r => plan!.surplus[r] > 0 && !plan!.missing.includes(r))
      .sort((a, b) => plan!.surplus[b] - plan!.surplus[a])[0]
    if (plan.missing.length <= 2 && spare && Math.random() < 0.6) {
      const offer = g.offerTrade(pid, { [spare]: 1 }, { [plan.missing[0]!]: 1 })
      if (offer) {
        const settled = () => g.trade.value?.id !== offer.id || Object.values(g.trade.value.responses).every(x => x !== 'pending')
        await waitUntil(settled, (offer.expiresAt ?? Date.now() + 20000) - Date.now())
        const open = g.trade.value?.id === offer.id ? g.trade.value : null
        // accepted, or a counter offer the bot can pay and likes
        const partners = open
          ? Object.keys(open.responses).filter((id) => {
              const price = g.dealPrice(open, id)
              return !!price && g.hasCards(pid, price) && (open.responses[id] === 'accept' || tradeScore(pid, open.want, price) >= 0)
            })
          : []
        await sleep(700)
        if (partners.length) g.completeTrade(pick(partners)!)
        else if (g.trade.value?.id === offer.id) g.cancelTrade()
        await sleep(500)
        plan = buildPlan(pid)
      }
    }

    // bank: trade surplus piles for missing cards
    while (plan?.missing.length) {
      const give = RESOURCE_ORDER.find(r => plan!.surplus[r] >= g.bankRate(pid, r) && hand()[r] >= g.bankRate(pid, r))
      if (!give || !g.bankTrade(pid, give, plan.missing[0]!)) break
      await sleep(700)
      plan = buildPlan(pid)
    }
  }

  // --- action cards ----------------------------------------------------------------
  const playable = (pid: string, kind: DevCardKind) =>
    g.devHand(pid).find(c => c.kind === kind && !g.devCardBlocker(pid, c))

  /** Before rolling: a fleet card to chase the pirates away from an own system. */
  async function fleetBeforeRoll(pid: string) {
    const card = playable(pid, 'fleet')
    if (!card) return
    const blocked = Object.values(g.board.value.corners)
      .some(c => c.tiles.includes(g.pirateTile.value) && g.structures.value[c.id]?.owner === pid)
    if (!blocked && Math.random() > 0.25) return
    await sleep(700)
    if (g.playDevCard(pid, card.id)) await waitUntil(() => !g.pirates.value, 30000)
  }

  /** After rolling: at most one card that helps with the next build. */
  async function cardForBuild(pid: string) {
    const plan = buildPlan(pid)
    const smuggler = playable(pid, 'smuggler')
    if (smuggler && plan && plan.missing.length >= 1 && plan.missing.length <= 2) {
      const picks = [...plan.missing, RESOURCE_ORDER[Math.floor(Math.random() * 5)]!].slice(0, 2)
      g.playDevCard(pid, smuggler.id, picks)
      return sleep(800)
    }
    const embargo = playable(pid, 'embargo')
    if (embargo && plan?.missing.length && Math.random() < 0.5) {
      g.playDevCard(pid, embargo.id, [plan.missing[0]!])
      return sleep(800)
    }
    const survey = playable(pid, 'survey')
    if (survey && !g.validSites('outpost', pid).length && g.validSites('route', pid).length) {
      g.playDevCard(pid, survey.id)
      while (g.freeRoutes.value > 0) {
        await sleep(700)
        const site = oneOfBest(g.validSites('route', pid), e => routeValue(e, pid), 2)
        if (!site || !g.build(pid, 'route', site)) break
      }
    }
  }

  // --- Städte & Ritter ---------------------------------------------------------------
  const ckOption = (id: BuildId) => BUILD_OPTIONS.find(o => o.id === id)!

  // --- progress cards ----------------------------------------------------------------
  const progressCard = (pid: string, kind: ProgressKind) =>
    g.progressHand(pid).find(c => c.kind === kind && !g.progressBlocker(pid, c))

  /** Own production for a dice sum (outposts 1, cities 2; the pirates block). */
  function yieldFor(pid: string, sum: number) {
    let n = 0
    for (const c of Object.values(g.board.value.corners)) {
      const st = g.structures.value[c.id]
      if (st?.owner !== pid) continue
      for (const t of c.tiles) {
        const tile = g.tiles.value[t]!
        if (t !== g.pirateTile.value && tile.number === sum && (tile.resource || tile.gold)) n += st.kind === 'base' ? 2 : 1
      }
    }
    return n
  }

  /** Before rolling: Wahrscheinlichkeitsdroide on the sum that pays best. */
  async function alchemistBeforeRoll(pid: string) {
    const card = progressCard(pid, 'alchemist')
    if (!card || Math.random() < 0.3) return
    const sums = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]
    const best = sums.sort((a, b) => yieldFor(pid, b) - yieldFor(pid, a))[0]!
    if (yieldFor(pid, best) < 2) return
    const a = Math.min(6, best - 1)
    await sleep(700)
    g.playProgress(pid, card.id, { dice: [a, best - a] })
  }

  /** After rolling: play the progress cards that help now. */
  async function progressTurn(pid: string) {
    const others = g.players.value.filter(p => p.id !== pid)
    const myVP = g.stats(g.players.value.find(p => p.id === pid)!).victoryPoints
    const pickOne = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
    for (const card of [...g.progressHand(pid)]) {
      if (g.winner.value || g.pirates.value) return
      if (g.progressBlocker(pid, card)) continue
      const t = g.progressTargets(pid, card.kind)
      let choice: ProgressChoice | null = null
      switch (card.kind) {
        case 'irrigation': case 'mining': case 'warlord': case 'commercialHarbor': case 'crane':
          if (card.kind === 'warlord' && (g.barbarians.value.step < 3 || !g.knightsOf(pid).some(([, k]) => !k.active))) break
          if (card.kind === 'commercialHarbor' && !others.some(o => COMMODITY_ORDER.some(c => g.hands.value[o.id]![c] > 0))) break
          if (card.kind === 'crane' && !TRACK_ORDER.some(tr => g.hands.value[pid]![TRACKS[tr].commodity] >= g.improvementsOf(pid)[tr])) break
          choice = {}
          break
        case 'saboteur':
          if (others.some(o => g.stats(o).victoryPoints >= myVP && g.handSize(o.id) >= 4)) choice = {}
          break
        case 'wedding':
          if (others.some(o => g.stats(o).victoryPoints > myVP && g.handSize(o.id) > 0)) choice = {}
          break
        case 'roadBuilding':
          if (!g.validSites('outpost', pid).length) choice = {}
          break
        case 'resourceMonopoly':
          choice = { card: buildPlan(pid)?.missing[0] ?? pickOne(RESOURCE_ORDER) }
          break
        case 'tradeMonopoly':
          choice = { card: [...COMMODITY_ORDER].sort((a, b) => g.hands.value[pid]![a] - g.hands.value[pid]![b])[0] }
          break
        case 'merchantFleet': {
          const big = CARD_ORDER.find(c => g.hands.value[pid]![c] >= 4)
          if (big) choice = { card: big }
          break
        }
        case 'engineer': case 'medicine': case 'intrigue':
          if (t.corners?.length) choice = { corner: pickOne(t.corners) }
          break
        case 'smith':
          if (t.corners?.length) choice = { corners: t.corners.slice(0, 2) }
          break
        case 'merchant':
          if (t.tiles?.length) choice = { tiles: [[...t.tiles].sort((a, b) => (PIPS[g.tiles.value[b]!.number ?? 0] ?? 0) - (PIPS[g.tiles.value[a]!.number ?? 0] ?? 0))[0]!] }
          break
        case 'masterMerchant': {
          const victim = [...(t.players ?? [])].sort((a, b) => g.handSize(b) - g.handSize(a))[0]
          if (victim) {
            const kinds = CARD_ORDER.filter(c => g.hands.value[victim]![c] > 0)
            choice = { player: victim, cards: [pickOne(kinds)!, pickOne(kinds)!].filter(Boolean) }
          }
          break
        }
        case 'spy': {
          const victim = pickOne(t.players ?? [])
          if (victim) choice = { player: victim, progressId: pickOne(g.progressHand(victim))!.id }
          break
        }
        case 'deserter': {
          const victim = [...(t.players ?? [])].sort((a, b) => g.activeKnightStrength(b) - g.activeKnightStrength(a))[0]
          if (victim) choice = { player: victim, corner: t.corners?.[0] }
          break
        }
        case 'diplomat': {
          const edge = pickOne((t.edges ?? []).filter(e => g.routes.value[e] !== pid))
          if (edge) choice = { edge }
          break
        }
        case 'bishop':
          if (Math.random() < 0.7) choice = {}
          break
        case 'inventor':
          if (Math.random() < 0.2 && (t.tiles?.length ?? 0) >= 2) {
            const [a, b] = [...t.tiles!].sort(() => Math.random() - 0.5)
            choice = { tiles: [a!, b!] }
          }
          break
      }
      if (!choice) continue
      await sleep(800)
      if (!g.playProgress(pid, card.id, choice)) continue
      // follow-ups
      if (card.kind === 'bishop') await waitUntil(() => !g.pirates.value, 30000)
      if (card.kind === 'roadBuilding' || card.kind === 'diplomat') {
        while (g.freeRoutes.value > 0) {
          await sleep(600)
          const site = oneOfBest(g.validSites('route', pid), e => routeValue(e, pid), 2)
          if (!site || !g.build(pid, 'route', site)) break
        }
      }
    }
  }

  async function ckTurn(pid: string) {
    await progressTurn(pid)
    const act = async (fn: () => unknown) => {
      if (g.winner.value) return
      if (fn()) await sleep(700)
    }
    // 1. city improvements (the commodity with the most cards first)
    const tracks = [...TRACK_ORDER].sort((a, b) => g.hands.value[pid]![TRACKS[b].commodity] - g.hands.value[pid]![TRACKS[a].commodity])
    for (const t of tracks) {
      if (Math.random() < 0.85 && !g.improvementBlocker(pid, t)) await act(() => g.buyImprovement(pid, t))
    }
    // 2. defense against the Hutten-Armada
    const strength = Object.values(g.structures.value).filter(x => x.kind === 'base').length
    const defense = g.players.value.reduce((a, p) => a + g.activeKnightStrength(p.id), 0)
    const threatened = g.barbarians.value.step >= 3 && defense < strength && Object.values(g.structures.value).some(x => x.owner === pid && x.kind === 'base')
    if (threatened || Math.random() < 0.2) {
      if (g.piecesLeft(pid, ckOption('knight')) && g.canPay(pid, ckOption('knight'))) {
        // fleets next to the pirates or near own cities are most useful
        const site = oneOfBest(g.validSites('knight', pid), (c) => {
          const corner = g.board.value.corners[c]!
          return (corner.tiles.includes(g.pirateTile.value) ? 3 : 0) + corner.neighbors.filter(n => g.structures.value[n]?.owner === pid).length
        }, 3)
        if (site) await act(() => g.build(pid, 'knight', site))
      }
    }
    if (threatened || g.barbarians.value.step >= 5) {
      for (const [c] of g.knightsOf(pid)) {
        if (!g.knightBlocker(pid, c, 'activate')) await act(() => g.activateKnight(pid, c))
      }
    }
    // 3. sometimes promote a fleet
    for (const [c] of g.knightsOf(pid)) {
      if (Math.random() < 0.3 && !g.knightBlocker(pid, c, 'promote')) await act(() => g.promoteKnight(pid, c))
    }
    // 4. chase the pirates off an own system
    const blocked = Object.values(g.board.value.corners).some(c => c.tiles.includes(g.pirateTile.value) && g.structures.value[c.id]?.owner === pid)
    if (blocked) {
      const chaser = g.knightsOf(pid).find(([c]) => !g.knightBlocker(pid, c, 'chase'))
      if (chaser) {
        await act(() => g.chasePirates(pid, chaser[0]))
        await waitUntil(() => !g.pirates.value, 30000)
      }
    }
    // 5. shield generator when the hand is big
    if (g.handSize(pid) >= 7 && Math.random() < 0.5 && g.piecesLeft(pid, ckOption('wall')) && g.canPay(pid, ckOption('wall'))) {
      const site = g.validSites('wall', pid)[0]
      if (site) await act(() => g.build(pid, 'wall', site))
    }
  }

  // --- normal turn -------------------------------------------------------------
  function canBuild(pid: string, kind: 'route' | 'outpost' | 'base') {
    const option = BUILD_OPTIONS.find(o => o.id === kind)!
    return g.piecesLeft(pid, option) && g.canPay(pid, option) && g.validSites(kind, pid).length > 0
  }

  /** The easy bot's next build, or null to stop. */
  function nextBuild(pid: string): { kind: 'route' | 'outpost' | 'base', site: string } | null {
    if (Math.random() < 0.2) return null // sometimes just doesn't build
    if (canBuild(pid, 'base') && Math.random() < 0.8) {
      const site = oneOfBest(g.validSites('base', pid), cornerValue, 2)
      if (site) return { kind: 'base', site }
    }
    if (canBuild(pid, 'outpost')) {
      const site = oneOfBest(g.validSites('outpost', pid), cornerValue, 3)
      if (site) return { kind: 'outpost', site }
    }
    // only build routes while there is no outpost site yet, and not always
    if (canBuild(pid, 'route') && g.validSites('outpost', pid).length === 0 && Math.random() < 0.7) {
      const site = oneOfBest(g.validSites('route', pid), e => routeValue(e, pid), 3)
      if (site) return { kind: 'route', site }
    }
    return null
  }

  /** A bot's turn. Can resume: if the dice were already rolled, it continues with building. */
  async function playTurn(pid: string) {
    busy.value = true
    try {
      if (!g.dice.value && !g.diceRoll.value) {
        if (!g.ck.value) await fleetBeforeRoll(pid)
        else await alchemistBeforeRoll(pid)
        if (g.winner.value) return
        await sleep(900)
        if (!g.diceRoll.value && !g.dice.value) await g.rollDice()
      }
      // wait for the dice animation and a possible pirate sequence (the human may have to discard)
      await waitUntil(() => !!g.dice.value && !g.diceRoll.value && !g.pirates.value, 60000)
      if (!g.dice.value || g.pirates.value) return // still blocked – the driver resumes the turn later
      await sleep(1200)
      if (!g.ck.value) await cardForBuild(pid)
      for (let i = 0; i < 2; i++) {
        if (g.winner.value) return
        await tradeForBuild(pid)
        const next = nextBuild(pid)
        if (!next) break
        g.build(pid, next.kind, next.site)
        await sleep(1000)
      }
      if (g.ck.value) await ckTurn(pid)
      // nothing (more) to build: sometimes buy an action card
      else if (!g.winner.value && Math.random() < 0.6 && g.buyActionCard(pid)) await sleep(700)
      if (g.winner.value) return
      await sleep(600)
      g.endTurn()
    }
    finally {
      busy.value = false
    }
  }

  return { busy, setupTurn, playTurn, wantsOffer, answerOffer }
}

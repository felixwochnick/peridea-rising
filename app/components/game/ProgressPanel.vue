<script setup lang="ts">
// Städte & Ritter: the human's progress cards – look at them, play them (with the decisions a
// card needs: dice, a card type, a player, cards of a player, or targets on the board) and
// discard down to 4 when over the limit.
const g = useGalacticGame()
const {
  me, players, progressHand, progressVP, progressDecks, progressBlocker, playProgress, progressTargets,
  progressDiscard, discardProgress, merchant, boosts, hands, tiles, stats,
} = g
const boardPick = useBoardPick()
const toast = useToast()

const open = useState('gc-progress-open', () => false)
const tradeOpen = useState('gc-trade-open', () => false)
const improveOpen = useState('gc-improve-open', () => false)
watch(open, (o) => {
  step.value = null
  if (o) {
    tradeOpen.value = false
    improveOpen.value = false
  }
})
// must discard → open automatically
watch(progressDiscard, (n) => { if (n > 0) open.value = true }, { immediate: true })
defineShortcuts({ k: () => { if (g.ck.value) open.value = !open.value } })

const hand = computed(() => progressHand(me.value.id))
const vpCards = computed(() => progressVP.value[me.value.id] ?? [])
const playerById = (id: string) => players.value.find(p => p.id === id)!
const colorVar = (c: string) => `var(--color-${c}-400)`

// --- multi-step decisions ------------------------------------------------------------------
interface Step {
  card: ProgressCard
  stage: 'dice' | 'card' | 'player' | 'playerCards' | 'playerProgress'
  options?: CardId[]
  dice: [number, number]
  card2?: CardId
  player?: string
  cards: CardId[]
  progressId?: number
}
const step = ref<Step | null>(null)

function fail(msg = 'Das geht gerade nicht') {
  toast.add({ title: msg, icon: 'i-lucide-circle-alert', color: 'warning', duration: 2200 })
}

function done(ok: boolean) {
  if (ok) {
    step.value = null
    if (!hand.value.length) open.value = false
  }
  else fail()
}

async function boardChoice(kind: 'tile' | 'corner' | 'edge', targets: (string | number)[], prompt: string, count = 1) {
  open.value = false
  const picked = await boardPick.pick({ kind, targets, prompt, count })
  return picked
}

async function play(card: ProgressCard) {
  const blocker = progressBlocker(me.value.id, card)
  if (blocker) return fail(blocker)
  const def = PROGRESS[card.kind]
  const t = progressTargets(me.value.id, card.kind)
  const pid = me.value.id
  switch (def.input) {
    case 'none': case 'pirates':
      return done(playProgress(pid, card.id))
    case 'dice':
      step.value = { card, stage: 'dice', dice: [3, 4], cards: [] }
      return
    case 'resource': case 'commodity': case 'card':
      step.value = {
        card,
        stage: 'card',
        dice: [1, 1],
        cards: [],
        options: def.input === 'resource' ? [...RESOURCE_ORDER] : def.input === 'commodity' ? [...COMMODITY_ORDER] : [...CARD_ORDER],
      }
      return
    case 'playerCards': case 'playerProgress': case 'knightCorner':
      step.value = { card, stage: 'player', dice: [1, 1], cards: [] }
      return
    case 'tiles2': {
      const picked = await boardChoice('tile', t.tiles!, `${def.name}: wähle zwei Systeme, deren Zahlen getauscht werden`, 2)
      if (picked) done(playProgress(pid, card.id, { tiles: picked as number[] }))
      return
    }
    case 'tile': {
      const picked = await boardChoice('tile', t.tiles!, `${def.name}: wähle ein System an deinen Docks`)
      if (picked) done(playProgress(pid, card.id, { tiles: picked as number[] }))
      return
    }
    case 'ownCity': case 'ownOutpost': case 'enemyKnight': {
      const what = def.input === 'ownCity' ? 'eine deiner Städte' : def.input === 'ownOutpost' ? 'einen deiner Außenposten' : 'eine gegnerische Flotte an deinen Routen'
      const picked = await boardChoice('corner', t.corners!, `${def.name}: wähle ${what}`)
      if (picked) done(playProgress(pid, card.id, { corner: picked[0] as string }))
      return
    }
    case 'ownKnights': {
      const picked = await boardChoice('corner', t.corners!, `${def.name}: wähle bis zu 2 Flotten`, Math.min(2, t.corners!.length))
      if (picked) done(playProgress(pid, card.id, { corners: picked as string[] }))
      return
    }
    case 'edge': {
      const picked = await boardChoice('edge', t.edges!, `${def.name}: wähle eine offene Route`)
      if (picked) done(playProgress(pid, card.id, { edge: picked[0] as string }))
      return
    }
  }
}

const stepPlayers = computed(() => {
  const s = step.value
  if (!s) return []
  return (progressTargets(me.value.id, s.card.kind).players ?? []).map(playerById)
})

async function pickPlayer(id: string) {
  const s = step.value!
  s.player = id
  const kind = s.card.kind
  if (kind === 'masterMerchant') s.stage = 'playerCards'
  else if (kind === 'spy') s.stage = 'playerProgress'
  else if (kind === 'deserter') {
    // where the deserting fleet joins you
    const corners = progressTargets(me.value.id, kind).corners ?? []
    let corner: string | undefined
    if (corners.length) {
      const picked = await boardChoice('corner', corners, `${PROGRESS.deserter.name}: wo stellst du die übergelaufene Flotte auf?`)
      if (!picked) return
      corner = picked[0] as string
    }
    done(playProgress(me.value.id, s.card.id, { player: id, corner }))
  }
}

const victimHand = computed(() => {
  const s = step.value
  return s?.player ? CARD_ORDER.filter(c => (hands.value[s.player!]?.[c] ?? 0) > 0) : []
})
function toggleTake(c: CardId) {
  const s = step.value!
  const have = hands.value[s.player!]![c]
  const taken = s.cards.filter(x => x === c).length
  if (s.cards.length < 2 && taken < have) s.cards.push(c)
  else s.cards = s.cards.filter((x, i) => !(x === c && i === s.cards.lastIndexOf(c)))
}

function confirm() {
  const s = step.value!
  const pid = me.value.id
  if (s.stage === 'dice') return done(playProgress(pid, s.card.id, { dice: s.dice }))
  if (s.stage === 'card' && s.card2) return done(playProgress(pid, s.card.id, { card: s.card2 }))
  if (s.stage === 'playerCards' && s.cards.length) return done(playProgress(pid, s.card.id, { player: s.player, cards: s.cards }))
  if (s.stage === 'playerProgress' && s.progressId) return done(playProgress(pid, s.card.id, { player: s.player, progressId: s.progressId }))
}

const merchantInfo = computed(() => {
  const m = merchant.value
  if (!m) return null
  const r = tiles.value[m.tile]?.resource
  return { owner: playerById(m.owner), resource: r ? RESOURCES[r].name : '?' }
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150"
    leave-to-class="translate-y-3 opacity-0"
  >
    <div v-if="open" class="hud-above-bar pointer-events-auto absolute inset-x-0 mx-auto w-fit">
      <div class="flex w-[42rem] max-w-full flex-col gap-3 rounded-xl border border-white/15 bg-black/85 px-3 py-3 shadow-2xl backdrop-blur-md sm:px-5 sm:py-4">
        <div class="flex flex-wrap items-center gap-2">
          <UIcon name="i-lucide-scroll" class="size-5 text-primary" />
          <span class="text-lg font-semibold">Fortschrittskarten</span>
          <span class="text-sm text-muted">{{ hand.length }}/{{ PROGRESS_HAND_LIMIT }}</span>
          <span class="flex gap-1.5 text-xs text-muted">
            <span v-for="t in TRACK_ORDER" :key="t" :style="{ color: TRACKS[t].color }">{{ TRACKS[t].name }} {{ progressDecks[t].length }}</span>
          </span>
          <UButton class="ml-auto" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Schließen" @click="open = false" />
        </div>

        <div v-if="progressDiscard > 0" class="rounded-lg border border-error/50 bg-error/10 px-3 py-2 text-sm text-error">
          Du hast mehr als {{ PROGRESS_HAND_LIMIT }} Karten – wirf {{ progressDiscard }} ab.
        </div>

        <!-- Decision steps -->
        <template v-if="step">
          <div class="text-base">
            <span class="font-semibold" :style="{ color: TRACKS[PROGRESS[step.card.kind].track].color }">{{ PROGRESS[step.card.kind].name }}</span>
            <span class="text-muted"> – {{ PROGRESS[step.card.kind].description }}</span>
          </div>

          <div v-if="step.stage === 'dice'" class="flex flex-wrap items-center gap-4">
            <div v-for="i in [0, 1]" :key="i" class="flex items-center gap-1">
              <span class="mr-1 text-sm text-muted">{{ i === 1 ? 'Roter' : 'Gelber' }} Würfel</span>
              <button
                v-for="n in 6"
                :key="n"
                type="button"
                class="size-8 rounded-md border text-sm font-bold"
                :class="step.dice[i] === n ? 'border-primary bg-primary/20 text-primary' : 'border-white/15'"
                @click="step.dice[i] = n"
              >{{ n }}</button>
            </div>
            <span class="text-sm text-muted">Summe {{ step.dice[0] + step.dice[1] }}</span>
          </div>

          <div v-else-if="step.stage === 'card'" class="flex flex-wrap gap-1.5">
            <button
              v-for="c in step.options"
              :key="c"
              type="button"
              class="flex w-16 flex-col items-center rounded-lg border p-1"
              :class="step.card2 === c ? 'border-primary bg-primary/15' : 'border-white/10 bg-white/5'"
              @click="step.card2 = c"
            >
              <img :src="CARD_INFO[c].image" :alt="CARD_INFO[c].name" class="size-9 object-contain">
              <span class="w-full truncate text-center text-[11px] text-muted">{{ CARD_INFO[c].name }}</span>
            </button>
          </div>

          <div v-else-if="step.stage === 'player'" class="flex flex-wrap gap-2">
            <UButton
              v-for="p in stepPlayers"
              :key="p.id"
              color="neutral"
              variant="outline"
              :style="{ borderColor: colorVar(p.color) }"
              @click="pickPlayer(p.id)"
            >
              <span :style="{ color: colorVar(p.color) }">{{ p.name }}</span>
              <span class="text-muted">· {{ stats(p).victoryPoints }} SP</span>
            </UButton>
          </div>

          <div v-else-if="step.stage === 'playerCards'" class="space-y-2">
            <div class="text-sm text-muted">Karten von {{ playerById(step.player!).name }} – wähle 2:</div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="c in victimHand"
                :key="c"
                type="button"
                class="relative flex w-16 flex-col items-center rounded-lg border p-1"
                :class="step.cards.includes(c) ? 'border-primary bg-primary/15' : 'border-white/10 bg-white/5'"
                @click="toggleTake(c)"
              >
                <img :src="CARD_INFO[c].image" :alt="CARD_INFO[c].name" class="size-9 object-contain">
                <span class="text-[11px] text-muted">{{ hands[step.player!]![c] }}×</span>
                <span v-if="step.cards.filter(x => x === c).length" class="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-black">{{ step.cards.filter(x => x === c).length }}</span>
              </button>
            </div>
          </div>

          <div v-else-if="step.stage === 'playerProgress'" class="flex flex-wrap gap-1.5">
            <button
              v-for="c in progressHand(step.player!)"
              :key="c.id"
              type="button"
              class="rounded-lg border px-2 py-1 text-sm"
              :class="step.progressId === c.id ? 'border-primary bg-primary/15' : 'border-white/10 bg-white/5'"
              :style="{ color: TRACKS[PROGRESS[c.kind].track].color }"
              @click="step.progressId = c.id"
            >{{ PROGRESS[c.kind].name }}</button>
          </div>

          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Zurück" @click="step = null" />
            <UButton
              v-if="step.stage !== 'player'"
              :icon="PROGRESS[step.card.kind].icon"
              label="Ausspielen"
              :disabled="(step.stage === 'card' && !step.card2) || (step.stage === 'playerCards' && !step.cards.length) || (step.stage === 'playerProgress' && !step.progressId)"
              @click="confirm"
            />
          </div>
        </template>

        <!-- Hand -->
        <template v-else>
          <div v-if="!hand.length" class="py-3 text-center text-muted">
            Keine Fortschrittskarten. Du ziehst welche, wenn der Ereigniswürfel ein Tor zeigt und der rote Würfel zu deiner Ausbaustufe passt.
          </div>
          <div
            v-for="c in hand"
            :key="c.id"
            class="flex items-center gap-3 rounded-lg border bg-white/5 px-3 py-2"
            :style="{ borderColor: `${TRACKS[PROGRESS[c.kind].track].color}55` }"
          >
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg" :style="{ background: `${TRACKS[PROGRESS[c.kind].track].color}26` }">
              <UIcon :name="PROGRESS[c.kind].icon" class="size-6" :style="{ color: TRACKS[PROGRESS[c.kind].track].color }" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-semibold">{{ PROGRESS[c.kind].name }}</span>
                <span class="text-xs text-dimmed">Catan: {{ PROGRESS[c.kind].catan }}</span>
              </div>
              <div class="text-sm text-muted">{{ PROGRESS[c.kind].description }}</div>
            </div>
            <UButton v-if="progressDiscard > 0" color="error" variant="outline" size="sm" label="Abwerfen" @click="discardProgress(c.id)" />
            <UTooltip v-else :text="progressBlocker(me.id, c) ?? 'Ausspielen'">
              <UButton size="sm" :disabled="!!progressBlocker(me.id, c)" label="Ausspielen" @click="play(c)" />
            </UTooltip>
          </div>

          <div v-if="vpCards.length || merchantInfo || boosts.crane || boosts.fleet" class="flex flex-wrap gap-2 text-xs">
            <UBadge v-for="(k, i) in vpCards" :key="i" color="primary" variant="subtle" icon="i-lucide-crown" :label="`${PROGRESS[k].name} (+1 SP)`" />
            <UBadge
              v-if="merchantInfo"
              color="neutral"
              variant="subtle"
              icon="i-lucide-ship"
              :label="`Handelskonvoi: ${merchantInfo.owner.name} (${merchantInfo.resource} 2:1, +1 SP)`"
            />
            <UBadge v-if="boosts.crane" color="success" variant="subtle" icon="i-lucide-construction" label="Nächster Ausbau −1 Ware" />
            <UBadge v-if="boosts.fleet" color="success" variant="subtle" icon="i-lucide-container" :label="`${CARD_INFO[boosts.fleet].name} 2:1 in diesem Zug`" />
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
// Bottom HUD: resources, build menu, trade, dice and end turn.
// Desktop: everything in one row. Compact (phone/tablet): resources left, round action
// buttons right and the build menu as a tray above them (like Catan Universe mobile).
const {
  resources, me, myTurn, activePlayer, piecesUsed, selectedBuild, dice, diceRoll,
  canAfford, isFree, buildBlocker, buyActionCard, rollDice, endTurn, pirates, setup, startRoll, canTrade, devHand,
  ck, eventDie, handSize, handLimit, walls, structures, progressHand, progressDiscard,
} = useGalacticGame()
// Städte & Ritter: progress cards
const progressOpen = useState('gc-progress-open', () => false)
const progressCount = computed(() => progressHand(me.value.id).length)
function toggleProgress() {
  progressOpen.value = !progressOpen.value
  if (progressOpen.value) {
    tradeOpen.value = false
    buildOpen.value = false
    improveOpen.value = false
  }
}
// Hand limit on a 7 (Städte & Ritter: +2 per shield generator)
const myCards = computed(() => handSize(me.value.id))
const myLimit = computed(() => handLimit(me.value.id))
const myWalls = computed(() => Object.keys(walls.value).filter(c => walls.value[c] && structures.value[c]?.owner === me.value.id).length)
const limitTip = computed(() => `Bei einer 7 wirfst du die Hälfte ab, wenn du mehr als ${myLimit.value} Karten hast`
  + (ck.value ? ` (7 + 2 je Schildgenerator, du hast ${myWalls.value})` : ''))
// Städte & Ritter: commodities in hand, its own build options, city improvements instead of action cards
const handCards = computed<CardId[]>(() => (ck.value ? CARD_ORDER : RESOURCE_ORDER))
const options = computed(() => buildOptionsFor(ck.value))
const improveOpen = useState('gc-improve-open', () => false)
function cardTip(id: CardId) {
  if (id in RESOURCES) {
    const r = RESOURCES[id as ResourceId]
    return `${r.name} · ${r.source} (Catan: ${r.catan})`
  }
  const c = COMMODITIES[id as CommodityId]
  return `${c.name} · Handelsware für ${TRACKS[c.track].name} (Catan: ${c.catan}) – von Städten an ${RESOURCES[c.from].name}-Systemen`
}
function toggleImprove() {
  improveOpen.value = !improveOpen.value
  if (improveOpen.value) {
    tradeOpen.value = false
    buildOpen.value = false
    devOpen.value = false
  }
}
const devOpen = useState('gc-dev-open', () => false)
const devCount = computed(() => devHand(me.value.id).length)
function toggleDev() {
  devOpen.value = !devOpen.value
  if (devOpen.value) {
    tradeOpen.value = false
    buildOpen.value = false
  }
}
const { compact, large, touch } = useHudLayout()
const toast = useToast()

const tradeOpen = useState('gc-trade-open', () => false)
const buildOpen = useState('gc-build-open', () => false)
function toggleTrade() {
  tradeOpen.value = !tradeOpen.value
  if (tradeOpen.value) {
    selectedBuild.value = null
    buildOpen.value = false
    devOpen.value = false
  }
}
function toggleBuild() {
  buildOpen.value = !buildOpen.value
  if (buildOpen.value) {
    tradeOpen.value = false
    devOpen.value = false
  }
}
// the tray closes when it's no longer the human's turn
watch(myTurn, (mine) => { if (!mine) buildOpen.value = false })

function buildImage(id: BuildId): string | null {
  if (id === 'outpost' || id === 'base') return `/images/ships/${SIDE_SHIPS[me.value.side][id]}.png`
  if (id === 'knight') return `/images/ships/${SIDE_KNIGHTS[me.value.side][1]}.png`
  return null
}
const BUILD_ICON: Partial<Record<BuildId, string>> = { route: 'i-lucide-route', action: 'i-lucide-scroll-text', wall: 'i-lucide-shield' }

function select(option: BuildOption) {
  if (selectedBuild.value === option.id) {
    selectedBuild.value = null
    return
  }
  const blocker = buildBlocker(option)
  if (blocker) {
    toast.add({ title: blocker, icon: 'i-lucide-circle-alert', color: 'warning', duration: 2000 })
    return
  }
  // the bought card is announced by the game (notice)
  if (option.id === 'action') buyActionCard()
  else {
    selectedBuild.value = option.id
    tradeOpen.value = false
    buildOpen.value = false
  }
}

const canRoll = computed(() => myTurn.value && !dice.value && !diceRoll.value && !setup.value && !startRoll.value)
const canEnd = computed(() => myTurn.value && !!dice.value && !pirates.value)
const affordable = computed(() => options.value.some(o => canAfford(o)) && myTurn.value)

// Both dice show the insignia of the rolling player's side.
const diceSide = computed<Side>(() => activePlayer.value.side)
const dieSize = computed(() => (compact.value ? 36 : large.value ? 48 : 42))
</script>

<template>
  <!-- ============ Compact: phone / tablet ============ -->
  <div v-if="compact" class="pointer-events-none relative flex flex-wrap-reverse items-end justify-between gap-2 px-2 pb-2">
    <!-- Resources -->
    <div class="pointer-events-auto flex gap-1 rounded-xl border border-white/10 bg-black/60 p-1 backdrop-blur-md">
      <div
        v-for="id in handCards"
        :id="`res-slot-${id}`"
        :key="id"
        class="relative flex flex-col items-center rounded-lg bg-white/5 py-1"
        :class="[resources[id] > 0 ? '' : 'opacity-50 grayscale', ck ? 'w-9 sm:w-11' : 'w-11 sm:w-13', id === 'bacta' ? 'ml-1 border-l border-white/20 pl-0.5' : '']"
        :title="CARD_INFO[id].name"
      >
        <img :src="CARD_INFO[id].image" :alt="CARD_INFO[id].name" class="object-contain" :class="ck ? 'size-7 sm:size-8' : 'size-8 sm:size-10'">
        <span
          class="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border border-white/20 bg-black text-xs font-bold"
          :style="resources[id] > 0 ? { color: CARD_INFO[id].color, borderColor: CARD_INFO[id].color } : undefined"
        >{{ resources[id] }}</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="pointer-events-auto ml-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/60 p-1.5 backdrop-blur-md">
      <UButton
        icon="i-lucide-hammer"
        size="lg"
        square
        :color="buildOpen || selectedBuild ? 'primary' : 'neutral'"
        :variant="buildOpen || selectedBuild ? 'solid' : 'outline'"
        aria-label="Bauen"
        :class="affordable && !buildOpen ? 'ring-2 ring-primary/60' : ''"
        @click="toggleBuild"
      />
      <UButton
        icon="i-lucide-arrow-left-right"
        size="lg"
        square
        color="neutral"
        :variant="tradeOpen ? 'solid' : 'outline'"
        aria-label="Handeln"
        :disabled="!canTrade(me.id)"
        @click="toggleTrade"
      />
      <UChip v-if="ck" :text="progressCount" :show="progressCount > 0" size="3xl" :color="progressDiscard > 0 ? 'error' : 'primary'">
        <UButton
          icon="i-lucide-scroll"
          size="lg"
          square
          color="neutral"
          :variant="progressOpen ? 'solid' : 'outline'"
          aria-label="Fortschrittskarten"
          @click="toggleProgress"
        />
      </UChip>
      <UButton
        v-if="ck"
        icon="i-lucide-building-2"
        size="lg"
        square
        color="neutral"
        :variant="improveOpen ? 'solid' : 'outline'"
        aria-label="Stadtausbau"
        @click="toggleImprove"
      />
      <UChip v-else :text="devCount" :show="devCount > 0" size="3xl" color="primary">
        <UButton
          icon="i-lucide-scroll-text"
          size="lg"
          square
          color="neutral"
          :variant="devOpen ? 'solid' : 'outline'"
          aria-label="Aktionskarten"
          @click="toggleDev"
        />
      </UChip>
      <div class="flex gap-1">
        <div
          v-for="i in [0, 1]"
          :id="`dice-slot-${i}`"
          :key="i"
          class="size-9 rounded-[22%]"
          :class="ck && i === 1 ? 'ring-2 ring-red-500' : ''"
        >
          <GameDie v-if="dice" :value="dice[i]!" :side="diceSide" :size="dieSize" />
          <div v-else class="size-9 rounded-[20%] border-2 border-dashed border-white/15" />
        </div>
        <div v-if="ck" id="dice-slot-2" class="size-9">
          <GameEventDie v-if="dice && eventDie" :value="eventDie" :size="dieSize" />
          <div v-else class="size-9 rounded-[20%] border-2 border-dashed border-white/15" />
        </div>
      </div>
      <UButton
        v-if="!dice || !myTurn"
        icon="i-lucide-dices"
        size="lg"
        :disabled="!canRoll"
        aria-label="Würfeln"
        :label="canRoll ? 'Würfeln' : undefined"
        :square="!canRoll"
        @click="rollDice()"
      />
      <UButton
        v-else
        icon="i-lucide-skip-forward"
        size="lg"
        color="neutral"
        variant="outline"
        aria-label="Zug beenden"
        label="Ende"
        :disabled="!canEnd"
        @click="endTurn"
      />
    </div>

    <!-- Build tray -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-3 opacity-0"
      leave-active-class="transition duration-150"
      leave-to-class="translate-y-3 opacity-0"
    >
      <div
        v-if="buildOpen"
        class="pointer-events-auto absolute right-2 bottom-full mb-1 grid gap-1 rounded-xl border border-white/10 bg-black/75 p-1.5 backdrop-blur-md"
        :class="options.length > 4 ? 'grid-cols-5' : 'grid-cols-4'"
      >
        <button
          v-for="option in options"
          :key="option.id"
          type="button"
          class="relative flex flex-col items-center rounded-lg border px-1 pt-1 pb-1.5 text-center"
          :class="[
            ck ? 'w-[4.1rem] sm:w-[5.25rem]' : 'w-[4.75rem] sm:w-24',
            canAfford(option) && myTurn ? 'border-white/15 bg-white/5' : 'border-white/5 opacity-55 grayscale',
            selectedBuild === option.id ? 'border-primary bg-primary/10' : '',
          ]"
          :aria-disabled="!canAfford(option) || !myTurn"
          @click="select(option)"
        >
          <div class="flex h-8 w-full items-center justify-center">
            <img v-if="buildImage(option.id)" :src="buildImage(option.id)!" :alt="option.name" class="max-h-8 w-full object-contain">
            <UIcon v-else :name="BUILD_ICON[option.id]!" class="size-6 text-primary" />
          </div>
          <span class="w-full truncate text-[11px] font-semibold text-white sm:text-xs">{{ option.name }}</span>
          <UBadge v-if="isFree(option.id)" class="mt-1" color="primary" variant="subtle" size="sm" label="Gratis" />
          <div v-else class="mt-1 flex flex-wrap justify-center gap-0.5">
            <span v-for="(n, r) in option.cost" :key="r" class="relative block size-5 sm:size-6">
              <img
                :src="CARD_INFO[r as CardId].image"
                :alt="CARD_INFO[r as CardId].name"
                class="size-full object-contain"
                :class="resources[r as CardId] >= n! ? '' : 'opacity-35'"
              >
              <span
                class="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full border bg-black text-[9px] leading-none font-bold"
                :class="resources[r as CardId] >= n! ? 'border-white/30 text-white' : 'border-error/70 text-error'"
              >{{ n }}</span>
            </span>
          </div>
          <span v-if="option.pieces" class="absolute top-0.5 right-1 text-[10px] text-muted">{{ option.pieces - piecesUsed[option.id] }}</span>
        </button>
      </div>
    </Transition>
  </div>

  <!-- ============ Desktop: medium (laptop) / large (big monitor) ============ -->
  <div v-else class="pointer-events-none flex items-end justify-between gap-3 px-4 pb-3">
    <!-- Resources -->
    <div class="pointer-events-auto flex gap-1.5 rounded-xl border border-white/10 bg-black/50 p-2 backdrop-blur-md large:gap-2">
      <UTooltip
        v-for="id in handCards"
        :key="id"
        :text="cardTip(id)"
      >
        <div
          :id="`res-slot-${id}`"
          class="relative flex flex-col items-center rounded-lg border border-white/5 bg-white/5 pt-1 pb-1.5 transition"
          :class="[
            resources[id] > 0 ? '' : 'opacity-50 grayscale',
            ck ? 'w-[3.15rem] large:w-20' : 'w-[4.75rem] large:w-24',
            id === 'bacta' ? 'ml-2' : '',
          ]"
        >
          <img :src="CARD_INFO[id].image" :alt="CARD_INFO[id].name" class="object-contain drop-shadow-lg" :class="ck ? 'size-9 large:size-12' : 'size-11 large:size-14'">
          <span class="w-full truncate px-0.5 text-center text-xs text-muted large:text-sm">{{ CARD_INFO[id].name }}</span>
          <span
            class="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border border-white/20 bg-black text-sm font-bold large:size-7 large:text-base"
            :style="resources[id] > 0 ? { color: CARD_INFO[id].color, borderColor: CARD_INFO[id].color } : undefined"
          >{{ resources[id] }}</span>
        </div>
      </UTooltip>
      <UTooltip :text="limitTip">
        <div
          class="flex w-11 flex-col items-center justify-center rounded-lg border px-1 text-center large:w-14"
          :class="myCards > myLimit ? 'border-error/60 bg-error/10 text-error' : 'border-white/5 bg-white/5 text-muted'"
        >
          <UIcon name="i-lucide-layers" class="size-4" />
          <span class="text-sm font-bold" :class="myCards > myLimit ? '' : 'text-white'">{{ myCards }}/{{ myLimit }}</span>
          <span class="text-[10px] leading-tight">Limit</span>
        </div>
      </UTooltip>
      <UTooltip v-if="ck" text="Fortschrittskarten (höchstens 4)" :kbds="touch ? [] : ['K']">
        <button
          type="button"
          class="flex w-11 flex-col items-center justify-center rounded-lg border px-1 text-center transition hover:border-primary/60 large:w-14"
          :class="progressDiscard > 0 ? 'border-error/60 bg-error/10 text-error' : progressOpen ? 'border-primary bg-primary/15 text-primary' : 'border-white/5 bg-white/5 text-muted'"
          @click="toggleProgress"
        >
          <UIcon name="i-lucide-scroll" class="size-4" />
          <span class="text-sm font-bold text-white">{{ progressCount }}/4</span>
          <span class="text-[10px] leading-tight">Karten</span>
        </button>
      </UTooltip>
    </div>

    <!-- Build menu -->
    <div class="pointer-events-auto flex gap-1.5 rounded-xl border border-white/10 bg-black/50 p-2 backdrop-blur-md large:gap-2">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="group relative flex flex-col items-center rounded-lg border px-1.5 pt-1 pb-2 text-center transition-all duration-200 large:px-2"
        :class="[
          ck ? 'w-[5.7rem] large:w-40' : 'w-32 large:w-44',
          canAfford(option) && myTurn
            ? 'cursor-pointer border-white/15 bg-white/5 hover:-translate-y-1 hover:border-primary/60 hover:bg-white/10'
            : 'cursor-not-allowed border-white/5 grayscale opacity-55',
          selectedBuild === option.id ? 'border-primary bg-primary/10 -translate-y-1' : '',
        ]"
        :aria-disabled="!canAfford(option) || !myTurn"
        @click="select(option)"
      >
        <div class="flex h-10 w-full items-center justify-center large:h-14">
          <img v-if="buildImage(option.id)" :src="buildImage(option.id)!" :alt="option.name" class="max-h-10 w-full object-contain drop-shadow-lg large:max-h-14">
          <UIcon v-else :name="BUILD_ICON[option.id]!" class="size-7 text-primary large:size-9" />
        </div>
        <span class="w-full truncate text-sm font-semibold text-white large:text-base">{{ option.name }}</span>
        <span class="text-xs text-muted large:text-sm">{{ option.catan }}</span>

        <!-- Setup phase: first outposts/routes are free -->
        <UBadge v-if="isFree(option.id)" class="mt-1.5" color="primary" variant="subtle" :size="large ? 'md' : 'sm'" icon="i-lucide-gift" label="Gratis (Aufbau)" />

        <!-- Cost: each resource once, with the required amount -->
        <div v-else class="mt-1 flex flex-wrap justify-center gap-1">
          <UTooltip
            v-for="(n, r) in option.cost"
            :key="r"
            :text="`${n}× ${CARD_INFO[r as CardId].name} (du hast ${resources[r as CardId]})`"
          >
            <span class="relative block size-7 large:size-9">
              <img
                :src="CARD_INFO[r as CardId].image"
                :alt="CARD_INFO[r as CardId].name"
                class="size-full object-contain drop-shadow"
                :class="resources[r as CardId] >= n! ? '' : 'opacity-35'"
              >
              <span
                class="absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full border bg-black px-0.5 text-[10px] leading-none font-bold large:h-4.5 large:min-w-4.5 large:text-xs"
                :class="resources[r as CardId] >= n! ? 'border-white/30 text-white' : 'border-error/70 text-error'"
              >{{ n }}</span>
            </span>
          </UTooltip>
        </div>

        <!-- Pieces left -->
        <span
          v-if="option.pieces"
          class="absolute top-1 right-2 text-xs font-semibold text-muted large:text-sm"
        >{{ option.pieces - piecesUsed[option.id] }}</span>
      </button>
    </div>

    <!-- Dice & turn -->
    <div class="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 p-2 backdrop-blur-md">
      <!-- Landing slots for DiceRoll.vue -->
      <div class="flex gap-2">
        <div
          v-for="i in [0, 1]"
          :id="`dice-slot-${i}`"
          :key="i"
          class="size-[42px] rounded-[22%] large:size-12"
          :class="ck && i === 1 ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-black' : ''"
          :title="ck && i === 1 ? 'Roter Würfel: entscheidet über Fortschrittskarten' : undefined"
        >
          <GameDie v-if="dice" :value="dice[i]!" :side="diceSide" :size="dieSize" />
          <div v-else class="size-full rounded-[20%] border-2 border-dashed border-white/15" />
        </div>
        <div v-if="ck" id="dice-slot-2" class="size-[42px] large:size-12">
          <GameEventDie v-if="dice && eventDie" :value="eventDie" :size="dieSize" />
          <div v-else class="size-full rounded-[20%] border-2 border-dashed border-white/15" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <UButton :size="large ? 'md' : 'sm'" icon="i-lucide-dices" label="Würfeln" block :disabled="!canRoll" @click="rollDice()" />
        <UTooltip text="Handeln" :kbds="touch ? [] : ['H']">
          <UButton
            :size="large ? 'md' : 'sm'"
            color="neutral"
            :variant="tradeOpen ? 'solid' : 'outline'"
            icon="i-lucide-arrow-left-right"
            label="Handeln"
            block
            :disabled="!canTrade(me.id)"
            @click="toggleTrade"
          />
        </UTooltip>
        <UTooltip v-if="ck" text="Stadtausbau & Metropolen" :kbds="touch ? [] : ['U']">
          <UButton
            :size="large ? 'md' : 'sm'"
            color="neutral"
            :variant="improveOpen ? 'solid' : 'outline'"
            icon="i-lucide-building-2"
            label="Ausbau"
            block
            @click="toggleImprove"
          />
        </UTooltip>
        <UTooltip v-else text="Aktionskarten" :kbds="touch ? [] : ['K']">
          <UButton
            :size="large ? 'md' : 'sm'"
            color="neutral"
            :variant="devOpen ? 'solid' : 'outline'"
            icon="i-lucide-scroll-text"
            :label="`Karten (${devCount})`"
            block
            @click="toggleDev"
          />
        </UTooltip>
        <UButton
          :size="large ? 'md' : 'sm'"
          color="neutral"
          variant="outline"
          icon="i-lucide-skip-forward"
          label="Zug beenden"
          block
          :disabled="!canEnd"
          @click="endTurn"
        />
      </div>
    </div>
  </div>
</template>

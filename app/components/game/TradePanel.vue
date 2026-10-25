<script setup lang="ts">
// Trading (Catan): offers and requests to the other players (they accept, decline or make
// a counter offer) and bank / trade station trades (4:1, 3:1, 2:1) on your own turn,
// plus offers from bots that the human can accept or decline.
const {
  me, players, resources, trade, canTrade, hasCards, bankRate, bankTrade, offerTrade, respondTrade, dealPrice, completeTrade, cancelTrade,
  harborsOf,
  ck,
} = useGalacticGame()
/** Städte & Ritter: commodities can be traded / lost too. */
const cards = computed<CardId[]>(() => (ck.value ? CARD_ORDER : RESOURCE_ORDER))

const open = useState('gc-trade-open', () => false)
const tab = ref<'players' | 'bank'>('players')
const allowed = computed(() => canTrade(me.value.id))
watch(allowed, (ok) => { if (!ok) open.value = false })
// only one popup at a time
const devOpen = useState('gc-dev-open', () => false)
watch(open, (o) => { if (o) devOpen.value = false })

defineShortcuts({
  h: () => { if (allowed.value) open.value = !open.value },
})

const player = (id: string) => players.value.find(p => p.id === id)!
const colorVar = (c: string) => `var(--color-${c}-400)`

// --- player trade ---------------------------------------------------------------
const give = ref<Hand>(emptyHand())
const want = ref<Hand>(emptyHand())
const total = (h: Partial<Hand>) => RESOURCE_ORDER.reduce((a, r) => a + (h[r] ?? 0), 0)

function change(side: 'give' | 'want', r: CardId, delta: number) {
  const h = side === 'give' ? give.value : want.value
  const next = h[r] + delta
  if (next < 0 || (side === 'give' && next > resources.value[r]) || next > 9) return
  h[r] = next
  // the same resource cannot be given and wanted at once
  if (delta > 0) (side === 'give' ? want.value : give.value)[r] = 0
}

const myOffer = computed(() => (trade.value?.from === me.value.id ? trade.value : null))
// closing the window withdraws an open offer
watch(open, (v) => { if (!v && myOffer.value) cancelTrade() })
function send() {
  if (offerTrade(me.value.id, give.value, want.value)) {
    give.value = emptyHand()
    want.value = emptyHand()
  }
}
const isRequest = computed(() => !!myOffer.value && !total(myOffer.value.give))
const STATUS = {
  pending: { label: 'überlegt …', color: 'neutral' as const, icon: 'i-lucide-loader-circle' },
  accept: { label: 'nimmt an', color: 'success' as const, icon: 'i-lucide-check' },
  counter: { label: 'will dafür', color: 'warning' as const, icon: 'i-lucide-repeat' },
  decline: { label: 'lehnt ab', color: 'error' as const, icon: 'i-lucide-x' },
  // a counter offer you couldn't pay is not shown
  unpayable: { label: 'kein passendes Angebot', color: 'neutral' as const, icon: 'i-lucide-minus' },
}
/** Answer of `pid` to my offer, with the price I would pay. */
function answer(pid: string) {
  const offer = myOffer.value!
  const status = offer.responses[pid]!
  const price = dealPrice(offer, pid)
  if (status === 'counter' && price && !hasCards(me.value.id, price)) return { status: 'unpayable' as const, price: null }
  return { status, price }
}

// --- bank trade ---------------------------------------------------------------------
const myStations = computed(() => harborsOf(me.value.id))
const bankGive = ref<CardId | null>(null)
const bankWant = ref<CardId | null>(null)
function doBankTrade() {
  if (!bankGive.value || !bankWant.value) return
  if (bankTrade(me.value.id, bankGive.value, bankWant.value) && resources.value[bankGive.value] < bankRate(me.value.id, bankGive.value)) {
    bankGive.value = null
  }
}

// --- incoming offer from a bot ---------------------------------------------------------
const incoming = computed(() => {
  const t = trade.value
  return t && t.from !== me.value.id && t.responses[me.value.id] === 'pending' ? t : null
})
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
watch(incoming, (t) => {
  clearInterval(clock)
  if (t) clock = setInterval(() => { now.value = Date.now() }, 200)
})
onBeforeUnmount(() => clearInterval(clock))
const timeLeft = computed(() => {
  const t = incoming.value
  if (!t?.expiresAt) return 1
  return Math.max(0, Math.min(1, (t.expiresAt - now.value) / 20000))
})
</script>

<template>
  <div class="hud-above-bar pointer-events-auto absolute inset-x-0 mx-auto w-fit">
    <!-- Offer from a bot -->
    <div
      v-if="incoming"
      class="flex w-[34rem] max-w-full flex-col items-center gap-2 sm:gap-3 overflow-hidden rounded-xl border bg-black/80 px-5 pt-4 pb-0 shadow-2xl backdrop-blur-md"
      :style="{ borderColor: colorVar(player(incoming.from).color) }"
    >
      <div class="text-lg">
        <span :style="{ color: colorVar(player(incoming.from).color) }">{{ player(incoming.from).name }}</span>
        bietet dir einen Handel an
      </div>
      <div class="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
        <div class="flex flex-col items-center gap-1">
          <span class="text-sm text-muted">Du bekommst</span>
          <GameTradeCards :cards="incoming.give" />
        </div>
        <UIcon name="i-lucide-arrow-left-right" class="size-6 text-muted" />
        <div class="flex flex-col items-center gap-1">
          <span class="text-sm text-muted">Du gibst</span>
          <GameTradeCards :cards="incoming.want" :check="resources" />
        </div>
      </div>
      <div class="flex gap-2">
        <UButton
          color="success"
          icon="i-lucide-check"
          label="Annehmen"
          :disabled="!hasCards(me.id, incoming.want)"
          @click="respondTrade(me.id, true)"
        />
        <UButton color="error" variant="outline" icon="i-lucide-x" label="Ablehnen" @click="respondTrade(me.id, false)" />
      </div>
      <div class="-mx-5 mt-1 h-1 self-stretch bg-white/10">
        <div class="h-full bg-primary transition-[width] duration-200" :style="{ width: `${timeLeft * 100}%` }" />
      </div>
    </div>

    <!-- Own trade window -->
    <div
      v-else-if="open && allowed"
      class="flex w-[40rem] max-w-full flex-col gap-3 rounded-xl border border-white/15 bg-black/80 px-3 py-3 shadow-2xl backdrop-blur-md sm:px-5 sm:py-4"
    >
      <div class="flex items-center gap-2">
        <UButton
          :variant="tab === 'players' ? 'solid' : 'ghost'"
          color="neutral"
          icon="i-lucide-users"
          label="Spieler"
          size="sm"
          @click="tab = 'players'"
        />
        <UButton
          :variant="tab === 'bank' ? 'solid' : 'ghost'"
          color="neutral"
          icon="i-lucide-landmark"
          :label="myStations.length ? 'Bank & Stationen' : `Bank ${BANK_RATE}:1`"
          size="sm"
          @click="tab = 'bank'"
        />
        <UButton class="ml-auto" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Schließen" @click="open = false" />
      </div>

      <!-- Players: my open offer and the answers -->
      <template v-if="tab === 'players' && myOffer">
        <div v-if="isRequest" class="flex flex-wrap items-center justify-center gap-3">
          <span class="text-sm text-muted">Deine Anfrage:</span>
          <GameTradeCards :cards="myOffer.want" />
          <span class="text-sm text-muted">– was wollen die anderen dafür?</span>
        </div>
        <div v-else class="flex flex-wrap items-center justify-center gap-4">
          <div class="flex flex-col items-center gap-1">
            <span class="text-sm text-muted">Du gibst</span>
            <GameTradeCards :cards="myOffer.give" />
          </div>
          <UIcon name="i-lucide-arrow-left-right" class="size-6 text-muted" />
          <div class="flex flex-col items-center gap-1">
            <span class="text-sm text-muted">Du bekommst</span>
            <GameTradeCards :cards="myOffer.want" />
          </div>
        </div>
        <div class="space-y-1.5">
          <div
            v-for="pid in Object.keys(myOffer.responses)"
            :key="pid"
            class="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/10 px-3 py-1.5"
          >
            <span class="w-28 truncate font-semibold sm:w-40" :style="{ color: colorVar(player(pid).color) }">{{ player(pid).name }}</span>
            <UBadge
              :color="STATUS[answer(pid).status].color"
              variant="subtle"
              :icon="STATUS[answer(pid).status].icon"
              :label="STATUS[answer(pid).status].label"
              :ui="{ leadingIcon: answer(pid).status === 'pending' ? 'animate-spin' : '' }"
            />
            <GameTradeCards v-if="answer(pid).status === 'counter'" :cards="answer(pid).price!" />
            <UButton
              v-if="answer(pid).status === 'accept' || answer(pid).status === 'counter'"
              class="ml-auto"
              size="sm"
              color="success"
              icon="i-lucide-handshake"
              label="Handeln"
              @click="completeTrade(pid)"
            />
          </div>
        </div>
        <UButton class="self-center" color="neutral" variant="outline" icon="i-lucide-undo-2" :label="isRequest ? 'Anfrage zurückziehen' : 'Angebot zurückziehen'" @click="cancelTrade" />
      </template>

      <!-- Players: compose an offer -->
      <template v-else-if="tab === 'players'">
        <div v-for="side in (['give', 'want'] as const)" :key="side">
          <div class="mb-1 text-sm text-muted">
            {{ side === 'give' ? 'Du gibst' : 'Du möchtest' }}
            <span v-if="side === 'give'" class="text-dimmed">(leer lassen = Anfrage, die anderen machen Gegenangebote)</span>
          </div>
          <div class="flex gap-1 sm:gap-2">
            <div
              v-for="r in cards"
              :key="r"
              class="flex flex-1 flex-col items-center rounded-lg border border-white/10 bg-white/5 p-1"
              :class="side === 'give' && !resources[r] ? 'opacity-40 grayscale' : ''"
            >
              <img :src="CARD_INFO[r].image" :alt="CARD_INFO[r].name" class="size-8 object-contain sm:size-11">
              <span class="hidden text-xs text-muted sm:block">{{ side === 'give' ? `${resources[r]} vorhanden` : CARD_INFO[r].name }}</span>
              <div class="mt-1 flex items-center gap-0 sm:gap-1">
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-minus" :aria-label="`${CARD_INFO[r].name} weniger`" @click="change(side, r, -1)" />
                <span class="w-4 text-center font-bold" :class="(side === 'give' ? give : want)[r] ? 'text-primary' : ''">{{ (side === 'give' ? give : want)[r] }}</span>
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-plus" :aria-label="`${CARD_INFO[r].name} mehr`" @click="change(side, r, 1)" />
              </div>
            </div>
          </div>
        </div>
        <UButton
          class="self-center"
          icon="i-lucide-send"
          :label="total(give) ? 'Angebot an alle senden' : 'Anfrage an alle senden'"
          :disabled="!total(want) || !!trade"
          @click="send"
        />
      </template>

      <!-- Bank -->
      <template v-else>
        <div v-if="myStations.length" class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <img src="/images/ships/trade-station.png" alt="" class="size-8 object-contain">
          Deine Handelsstationen:
          <UBadge
            v-for="h in myStations"
            :key="h.edge"
            color="neutral"
            variant="outline"
            :label="h.resource ? `2:1 ${RESOURCES[h.resource].name}` : '3:1 beliebig'"
          />
        </div>
        <div>
          <div class="mb-1 text-sm text-muted">Du gibst {{ bankGive ? `${bankRate(me.id, bankGive)}×` : '' }}</div>
          <div class="flex gap-2">
            <button
              v-for="r in cards"
              :key="r"
              type="button"
              class="flex flex-1 flex-col items-center rounded-lg border p-1 transition"
              :class="[
                bankGive === r ? 'border-primary bg-primary/15' : 'border-white/10 bg-white/5',
                resources[r] >= bankRate(me.id, r) ? 'cursor-pointer hover:border-primary/60' : 'cursor-not-allowed opacity-40 grayscale',
              ]"
              :disabled="resources[r] < bankRate(me.id, r)"
              @click="bankGive = r; if (bankWant === r) bankWant = null"
            >
              <img :src="CARD_INFO[r].image" :alt="CARD_INFO[r].name" class="size-8 object-contain sm:size-11">
              <span class="text-xs text-muted">{{ resources[r] }}<span class="hidden sm:inline"> vorhanden</span></span>
              <span
                class="mt-0.5 rounded-full px-1.5 text-xs font-bold"
                :class="bankRate(me.id, r) < BANK_RATE ? 'bg-primary/20 text-primary' : 'text-dimmed'"
              >{{ bankRate(me.id, r) }}:1</span>
            </button>
          </div>
        </div>
        <div>
          <div class="mb-1 text-sm text-muted">Du bekommst 1×</div>
          <div class="flex gap-2">
            <button
              v-for="r in cards"
              :key="r"
              type="button"
              class="flex flex-1 flex-col items-center rounded-lg border p-1 transition"
              :class="[
                bankWant === r ? 'border-primary bg-primary/15' : 'border-white/10 bg-white/5',
                bankGive === r ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:border-primary/60',
              ]"
              :disabled="bankGive === r"
              @click="bankWant = r"
            >
              <img :src="CARD_INFO[r].image" :alt="CARD_INFO[r].name" class="size-8 object-contain sm:size-11">
              <span class="text-xs text-muted">{{ CARD_INFO[r].name }}</span>
            </button>
          </div>
        </div>
        <UButton
          class="self-center"
          icon="i-lucide-landmark"
          label="Tauschen"
          :disabled="!bankGive || !bankWant"
          @click="doBankTrade"
        />
      </template>
    </div>
  </div>
</template>

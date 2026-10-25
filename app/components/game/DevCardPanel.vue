<script setup lang="ts">
// The human's action cards (Catan development cards): look at them and play one per turn.
const { me, devHand, devCardBlocker, playDevCard, devDeck } = useGalacticGame()
const toast = useToast()

const open = useState('gc-dev-open', () => false)
// in Städte & Ritter K opens the progress cards (ProgressPanel) instead
const { ck } = useGalacticGame()
defineShortcuts({ k: () => { if (!ck.value) open.value = !open.value } })

const hand = computed(() => devHand(me.value.id))
/** Playable kinds grouped (one entry per kind, the first card of it is played). */
const groups = computed(() => DEV_CARD_ORDER.filter(k => k !== 'victory').flatMap((kind) => {
  const cards = hand.value.filter(c => c.kind === kind)
  if (!cards.length) return []
  // prefer a card that is not fresh
  const card = cards.find(c => !c.fresh) ?? cards[0]!
  return [{ kind, info: DEV_CARDS[kind], count: cards.length, fresh: cards.filter(c => c.fresh).length, card, blocker: devCardBlocker(me.value.id, card) }]
}))
const victoryCards = computed(() => hand.value.filter(c => c.kind === 'victory'))

// resource choice for Schmugglerfund (2) and Handelsembargo (1)
const choosing = ref<{ cardId: number, kind: DevCardKind, picks: ResourceId[] } | null>(null)
const needed = computed(() => (choosing.value?.kind === 'smuggler' ? 2 : 1))
const tradeOpen = useState('gc-trade-open', () => false)
watch(open, (o) => {
  choosing.value = null
  if (o) tradeOpen.value = false
})

function play(g: (typeof groups.value)[number]) {
  if (g.blocker) {
    toast.add({ title: g.blocker, icon: 'i-lucide-circle-alert', color: 'warning', duration: 2200 })
    return
  }
  if (g.kind === 'smuggler' || g.kind === 'embargo') {
    choosing.value = { cardId: g.card.id, kind: g.kind, picks: [] }
    return
  }
  if (playDevCard(me.value.id, g.card.id)) open.value = false
}

function pick(r: ResourceId) {
  const c = choosing.value
  if (!c) return
  c.picks = needed.value === 1 ? [r] : [...c.picks, r].slice(-2)
}
function confirmChoice() {
  const c = choosing.value
  if (!c || c.picks.length !== needed.value) return
  if (playDevCard(me.value.id, c.cardId, c.picks)) open.value = false
  choosing.value = null
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150"
    leave-to-class="translate-y-3 opacity-0"
  >
    <div v-if="open" class="hud-above-bar pointer-events-auto absolute inset-x-0 mx-auto w-fit">
      <div class="flex w-[38rem] max-w-full flex-col gap-3 rounded-xl border border-white/15 bg-black/80 px-3 py-3 shadow-2xl backdrop-blur-md sm:px-5 sm:py-4">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-scroll-text" class="size-5 text-primary" />
          <span class="text-lg font-semibold">Aktionskarten</span>
          <span class="text-sm text-muted">· {{ devDeck.length }} im Vorrat</span>
          <UButton class="ml-auto" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Schließen" @click="open = false" />
        </div>

        <!-- Resource choice -->
        <template v-if="choosing">
          <div class="text-base">
            {{ DEV_CARDS[choosing.kind].name }}:
            <span class="text-muted">{{ choosing.kind === 'smuggler' ? 'wähle 2 Rohstoffe (auch zweimal denselben)' : 'welchen Rohstoff ziehst du ein?' }}</span>
          </div>
          <div class="flex gap-1 sm:gap-2">
            <button
              v-for="r in RESOURCE_ORDER"
              :key="r"
              type="button"
              class="relative flex flex-1 flex-col items-center rounded-lg border p-1 transition hover:border-primary/60"
              :class="choosing.picks.includes(r) ? 'border-primary bg-primary/15' : 'border-white/10 bg-white/5'"
              @click="pick(r)"
            >
              <img :src="`/images/resources/${r}.png`" :alt="RESOURCES[r].name" class="size-9 object-contain sm:size-11">
              <span class="hidden text-xs text-muted sm:block">{{ RESOURCES[r].name }}</span>
              <span
                v-if="choosing.picks.filter(x => x === r).length"
                class="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-black"
              >{{ choosing.picks.filter(x => x === r).length }}</span>
            </button>
          </div>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Zurück" @click="choosing = null" />
            <UButton
              :icon="DEV_CARDS[choosing.kind].icon"
              label="Ausspielen"
              :disabled="choosing.picks.length !== needed"
              @click="confirmChoice"
            />
          </div>
        </template>

        <!-- Hand -->
        <template v-else>
          <div v-if="!hand.length" class="py-4 text-center text-muted">
            Keine Aktionskarten. Kaufen über „Aktionskarte“ im Baumenü.
          </div>
          <div
            v-for="g in groups"
            :key="g.kind"
            class="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          >
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              <UIcon :name="g.info.icon" class="size-6 text-primary" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-semibold">{{ g.info.name }}</span>
                <UBadge v-if="g.count > 1" size="sm" color="neutral" variant="subtle" :label="`${g.count}×`" />
                <span class="text-xs text-dimmed">Catan: {{ g.info.catan }}</span>
              </div>
              <div class="text-sm text-muted">{{ g.info.description }}</div>
              <div v-if="g.fresh" class="text-xs text-warning">{{ g.fresh }} neu gekauft – ab dem nächsten Zug spielbar</div>
            </div>
            <UTooltip :text="g.blocker ?? 'Ausspielen'">
              <UButton :disabled="!!g.blocker" label="Ausspielen" @click="play(g)" />
            </UTooltip>
          </div>
          <div
            v-if="victoryCards.length"
            class="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
          >
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              <UIcon name="i-lucide-crown" class="size-6 text-primary" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="font-semibold">Siegpunkte: +{{ victoryCards.length }}</div>
              <div class="text-sm text-muted">{{ victoryCards.map(c => c.title).join(', ') }} – verdeckt, zählen automatisch.</div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

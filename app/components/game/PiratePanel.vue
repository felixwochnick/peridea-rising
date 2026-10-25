<script setup lang="ts">
// HUD for the pirate sequence after a 7: discard (if > 7 cards), move hint, pick a victim.
const { pirates, pirateDiscard, me, players, resources, discardCards, steal, handSize, ck } = useGalacticGame()
/** Städte & Ritter: commodities can be traded / lost too. */
const cards = computed<CardId[]>(() => (ck.value ? CARD_ORDER : RESOURCE_ORDER))

const selection = ref<Record<CardId, number>>(emptyHand())
const chosen = computed(() => Object.values(selection.value).reduce((a, b) => a + b, 0))
watch(() => pirates.value?.phase, () => {
  selection.value = emptyHand()
})

function change(r: CardId, delta: number) {
  const next = selection.value[r] + delta
  if (next < 0 || next > resources.value[r]) return
  if (delta > 0 && chosen.value >= pirateDiscard.value) return
  selection.value[r] = next
}

const rollerName = computed(() => players.value.find(p => p.id === pirates.value?.roller)?.name)
const myMove = computed(() => pirates.value?.roller === me.value.id)
const discardingNames = computed(() => Object.keys(pirates.value?.discards ?? {}).map(id => players.value.find(p => p.id === id)?.name).join(', '))
const victims = computed(() => (pirates.value?.victims ?? []).map(id => players.value.find(p => p.id === id)!))
</script>

<template>
  <div v-if="pirates" class="hud-above-bar pointer-events-auto absolute inset-x-0 mx-auto w-fit">
    <!-- Discard -->
    <div
      v-if="pirates.phase === 'discard' && pirateDiscard > 0"
      class="flex flex-col items-center gap-3 rounded-xl border border-error/50 bg-black/75 px-3 py-3 sm:px-5 sm:py-4 shadow-[0_0_30px_-6px_rgb(239_68_68/0.6)] backdrop-blur-md"
    >
      <div class="flex items-center gap-2 text-lg text-error">
        <UIcon name="i-lucide-skull" class="size-5" />
        Piratenüberfall! Wirf {{ pirateDiscard }} Karten ab
      </div>
      <div class="flex gap-1 sm:gap-2">
        <div
          v-for="id in cards"
          :key="id"
          class="flex w-14 flex-col items-center rounded-lg border border-white/10 bg-white/5 p-1 sm:w-20"
          :class="resources[id] ? '' : 'opacity-40 grayscale'"
        >
          <img :src="CARD_INFO[id].image" :alt="CARD_INFO[id].name" class="size-8 object-contain sm:size-11">
          <span class="text-xs text-muted">{{ resources[id] }}<span class="hidden sm:inline"> vorhanden</span></span>
          <div class="mt-1 flex items-center gap-0 sm:gap-1">
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-minus" :aria-label="`${CARD_INFO[id].name} weniger`" @click="change(id, -1)" />
            <span class="w-4 text-center font-bold" :class="selection[id] ? 'text-error' : ''">{{ selection[id] }}</span>
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-plus" :aria-label="`${CARD_INFO[id].name} mehr`" @click="change(id, 1)" />
          </div>
        </div>
      </div>
      <UButton
        color="error"
        icon="i-lucide-trash-2"
        :label="`Abwerfen (${chosen}/${pirateDiscard})`"
        :disabled="chosen !== pirateDiscard"
        @click="discardCards(selection)"
      />
    </div>

    <!-- Others still discarding (multiplayer) -->
    <div
      v-else-if="pirates.phase === 'discard'"
      class="flex items-center gap-2 rounded-full border border-error/50 bg-black/70 px-4 py-2 text-sm whitespace-nowrap backdrop-blur-md sm:px-5 sm:text-base"
    >
      <UIcon name="i-lucide-skull" class="size-5 text-error" />
      {{ discardingNames }} {{ Object.keys(pirates.discards).length > 1 ? 'werfen' : 'wirft' }} Karten ab …
    </div>

    <!-- Move hint -->
    <div
      v-else-if="pirates.phase === 'move'"
      class="flex items-center gap-2 rounded-full border border-error/50 bg-black/70 px-4 py-2 text-sm whitespace-nowrap backdrop-blur-md sm:px-5 sm:text-base"
    >
      <UIcon name="i-lucide-skull" class="size-5 text-error" />
      <template v-if="myMove">Versetze die Piraten: wähle ein rot markiertes System</template>
      <template v-else>{{ rollerName }} versetzt die Piraten …</template>
    </div>

    <!-- Choose victim -->
    <div
      v-else-if="pirates.phase === 'steal' && myMove"
      class="flex flex-col items-center gap-3 rounded-xl border border-error/50 bg-black/75 px-5 py-4 backdrop-blur-md"
    >
      <div class="text-lg">Von wem stiehlst du eine Karte?</div>
      <div class="flex flex-wrap justify-center gap-2">
        <UButton
          v-for="v in victims"
          :key="v.id"
          color="neutral"
          variant="outline"
          size="lg"
          :style="{ borderColor: `var(--color-${v.color}-400)` }"
          @click="steal(v.id)"
        >
          <span :style="{ color: `var(--color-${v.color}-400)` }">{{ v.name }}</span>
          <span class="text-muted">· {{ handSize(v.id) }} Karten</span>
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Städte & Ritter city improvements: three tracks (Handel / Politik / Wissenschaft), five levels each,
// paid with the matching commodity. Level 3 unlocks an ability, the first to level 4 gets the metropolis.
const { me, players, structures, improvementsOf, improvementBlocker, buyImprovement, metropolis, resources, ck } = useGalacticGame()
const toast = useToast()
const open = useState('gc-improve-open', () => false)
const devOpen = useState('gc-dev-open', () => false)
const tradeOpen = useState('gc-trade-open', () => false)
watch(open, (o) => {
  if (o) {
    devOpen.value = false
    tradeOpen.value = false
  }
})
defineShortcuts({ u: () => { if (ck.value) open.value = !open.value } })

const levels = computed(() => improvementsOf(me.value.id))
const colorVar = (c: string) => `var(--color-${c}-400)`

function metroHolder(track: ImprovementTrack) {
  const at = metropolis.value[track]
  const owner = at ? structures.value[at]?.owner : null
  return owner ? players.value.find(p => p.id === owner) : null
}

/** Best level of the other players per track (for the metropolis race). */
function rivalLevel(track: ImprovementTrack) {
  return Math.max(0, ...players.value.filter(p => p.id !== me.value.id).map(p => improvementsOf(p.id)[track]))
}

function buy(track: ImprovementTrack) {
  const blocker = improvementBlocker(me.value.id, track)
  if (blocker) {
    toast.add({ title: blocker, icon: 'i-lucide-circle-alert', color: 'warning', duration: 2200 })
    return
  }
  buyImprovement(me.value.id, track)
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150"
    leave-to-class="translate-y-3 opacity-0"
  >
    <div v-if="open && ck" class="hud-above-bar pointer-events-auto absolute inset-x-0 mx-auto w-fit">
      <div class="flex w-[46rem] max-w-full flex-col gap-3 rounded-xl border border-white/15 bg-black/85 px-3 py-3 shadow-2xl backdrop-blur-md sm:px-5 sm:py-4">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-building-2" class="size-5 text-primary" />
          <span class="text-lg font-semibold">Stadtausbau</span>
          <span class="hidden text-sm text-muted sm:inline">· Stufe n kostet n Waren · wer zuerst Stufe 4 erreicht, bekommt die Metropole (+2 SP)</span>
          <UButton class="ml-auto" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Schließen" @click="open = false" />
        </div>

        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div
            v-for="t in TRACK_ORDER"
            :key="t"
            class="flex flex-col gap-2 rounded-lg border bg-white/5 p-2.5"
            :style="{ borderColor: `${TRACKS[t].color}66` }"
          >
            <div class="flex items-center gap-2">
              <img :src="CARD_INFO[TRACKS[t].commodity].image" alt="" class="size-8 object-contain">
              <div class="min-w-0 flex-1">
                <div class="font-semibold" :style="{ color: TRACKS[t].color }">{{ TRACKS[t].name }}</div>
                <div class="text-xs text-muted">{{ COMMODITIES[TRACKS[t].commodity].name }}: {{ resources[TRACKS[t].commodity] }}</div>
              </div>
            </div>

            <!-- 5 levels -->
            <div class="flex gap-1">
              <UTooltip v-for="(name, i) in TRACKS[t].levels" :key="name" :text="`Stufe ${i + 1}: ${name}${i === 2 ? ` – ${TRACKS[t].ability}` : ''}${i >= 3 ? ' – Metropole möglich' : ''}`">
                <div
                  class="flex h-7 flex-1 items-center justify-center rounded text-xs font-bold"
                  :style="i < levels[t] ? { background: TRACKS[t].color, color: '#000' } : { border: `1px solid ${TRACKS[t].color}55`, color: TRACKS[t].color }"
                >
                  <UIcon v-if="i === 2" name="i-lucide-star" class="size-3.5" />
                  <UIcon v-else-if="i >= 3" name="i-lucide-castle" class="size-3.5" />
                  <span v-else>{{ i + 1 }}</span>
                </div>
              </UTooltip>
            </div>
            <div class="min-h-8 text-xs text-muted">
              <template v-if="levels[t] > 0">{{ TRACKS[t].levels[levels[t] - 1] }}</template>
              <template v-else>Noch nicht ausgebaut</template>
              <div v-if="levels[t] >= 3" class="text-success">{{ TRACKS[t].ability }}</div>
              <div v-else class="text-dimmed">Ab Stufe 3: {{ TRACKS[t].ability }}</div>
            </div>

            <!-- metropolis -->
            <div class="flex items-center gap-1.5 text-xs">
              <UIcon name="i-lucide-castle" class="size-4" :class="metroHolder(t) ? '' : 'text-dimmed'" />
              <span v-if="metroHolder(t)" :style="{ color: colorVar(metroHolder(t)!.color) }">Metropole: {{ metroHolder(t)!.name }}</span>
              <span v-else class="text-dimmed">Metropole frei · bester Gegner Stufe {{ rivalLevel(t) }}</span>
            </div>

            <UTooltip :text="improvementBlocker(me.id, t) ?? `Ausbauen: ${levels[t] + 1} ${COMMODITIES[TRACKS[t].commodity].name}`">
              <UButton
                block
                size="sm"
                :disabled="!!improvementBlocker(me.id, t)"
                :label="levels[t] >= 5 ? 'Voll ausgebaut' : `Stufe ${levels[t] + 1} · ${levels[t] + 1}× ${COMMODITIES[TRACKS[t].commodity].name}`"
                @click="buy(t)"
              />
            </UTooltip>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

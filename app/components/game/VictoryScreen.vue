<script setup lang="ts">
// Game over: the winner, final ranking (victory point cards revealed), back to the lobby.
const { winner, players, stats, devHand } = useGalacticGame()
const { resetGame } = useGameSave()
const dismissed = ref(false)
watch(winner, () => { dismissed.value = false })

const ranking = computed(() => players.value
  .map(p => ({ p, st: stats(p), cards: devHand(p.id).filter(c => c.kind === 'victory') }))
  .sort((a, b) => b.st.totalPoints - a.st.totalPoints))
const champion = computed(() => players.value.find(p => p.id === winner.value))
const colorVar = (c: string) => `var(--color-${c}-400)`

const mp = useMultiplayer()
async function toLobby() {
  if (mp.active.value) await mp.leave()
  resetGame()
  if (document.fullscreenElement) await document.exitFullscreen()
  await navigateTo('/game-modes/galactic-colonization')
}
</script>

<template>
  <Transition enter-active-class="transition duration-700" enter-from-class="opacity-0 scale-95">
    <div v-if="champion && !dismissed" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div class="w-full max-w-xl rounded-2xl border bg-black/85 p-6 shadow-2xl" :style="{ borderColor: colorVar(champion.color), boxShadow: `0 0 60px -10px ${colorVar(champion.color)}` }">
        <div class="text-center">
          <UIcon :name="champion.side === 'rebel' ? 'i-fa6-brands-rebel' : 'i-fa6-brands-empire'" class="size-14" :style="{ color: colorVar(champion.color) }" />
          <div class="mt-2 font-star-jedi text-3xl lowercase" :style="{ color: colorVar(champion.color) }">
            {{ champion.kind === 'human' ? 'Sieg!' : 'Niederlage' }}
          </div>
          <div class="mt-1 text-lg">
            {{ champion.name }} {{ champion.kind === 'human' ? 'hast' : 'hat' }} die Galaxis erobert.
          </div>
        </div>

        <div class="mt-5 space-y-1.5">
          <div
            v-for="(r, i) in ranking"
            :key="r.p.id"
            class="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2"
            :class="r.p.id === winner ? 'bg-white/10' : ''"
          >
            <span class="w-5 text-muted">{{ i + 1 }}.</span>
            <span class="flex-1 truncate font-semibold" :style="{ color: colorVar(r.p.color) }">{{ r.p.name }}</span>
            <UTooltip v-if="r.cards.length" :text="r.cards.map(c => c.title).join(', ')">
              <UBadge color="primary" variant="subtle" icon="i-lucide-crown" :label="`${r.cards.length} verdeckt`" />
            </UTooltip>
            <span class="w-14 text-right text-xl font-bold" :style="{ color: colorVar(r.p.color) }">{{ r.st.totalPoints }} SP</span>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" icon="i-lucide-eye" label="Spielfeld ansehen" @click="dismissed = true" />
          <UButton icon="i-lucide-rotate-ccw" label="Neues Spiel" @click="toLobby" />
        </div>
      </div>
    </div>
  </Transition>
</template>

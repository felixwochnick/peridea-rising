<script setup lang="ts">
// "Wer beginnt?" – every player rolls two dice of their side, highest sum starts, ties roll again.
const { startRoll, players } = useGalacticGame()
const { settings } = useUserSettings()

const rnd = () => 1 + Math.floor(Math.random() * 6)
const shuffled = ref<[number, number]>([1, 1])
let timer: ReturnType<typeof setInterval> | undefined
watch(() => startRoll.value?.current, (cur) => {
  clearInterval(timer)
  if (cur) timer = setInterval(() => { shuffled.value = [rnd(), rnd()] }, 85)
})
onBeforeUnmount(() => clearInterval(timer))

/** Rows grouped by round (round 2+ = tie-break). */
const rounds = computed(() => {
  const st = startRoll.value
  if (!st) return []
  const byRound = new Map<number, typeof st.results>()
  for (const r of st.results) byRound.set(r.round, [...(byRound.get(r.round) ?? []), r])
  return [...byRound.entries()].map(([round, results]) => {
    const sums = results.map(r => (r.values ? r.values[0] + r.values[1] : -1))
    const complete = results.length > 0 && sums.every(x => x >= 0)
    const best = Math.max(...sums)
    return {
      round,
      tie: complete && sums.filter(x => x === best).length > 1,
      rows: results.map(r => ({ ...r, player: players.value.find(p => p.id === r.playerId)!, best: complete && r.values !== null && r.values[0] + r.values[1] === best })),
    }
  })
})

const winner = computed(() => players.value.find(p => p.id === startRoll.value?.winner))
const colorVar = (c: string) => `var(--color-${c}-400)`
</script>

<template>
  <Transition leave-active-class="transition-opacity duration-500" leave-to-class="opacity-0">
    <div v-if="startRoll" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="w-full max-w-2xl rounded-2xl border border-white/10 bg-black/70 p-6 shadow-2xl">
        <div class="mb-1 text-center font-star-jedi text-3xl text-primary lowercase">Wer beginnt?</div>
        <div class="mb-5 flex items-center justify-center gap-2 text-sm text-muted">
          <UIcon :name="RANDOM_SOURCES[settings.randomSource].icon" class="size-4" />
          Gewürfelt mit {{ RANDOM_SOURCES[settings.randomSource].name }} · höchste Summe beginnt
        </div>

        <div class="max-h-[60vh] space-y-4 overflow-y-auto">
          <div v-for="r in rounds" :key="r.round">
            <div v-if="r.round > 1" class="mb-2 flex items-center gap-2 text-sm text-warning">
              <UIcon name="i-lucide-swords" class="size-4" /> Stechen (Runde {{ r.round }})
            </div>
            <div class="space-y-2">
              <div
                v-for="row in r.rows"
                :key="row.playerId"
                class="flex items-center gap-4 rounded-xl border px-4 py-2 transition-all duration-300"
                :class="row.best ? 'border-white/40 bg-white/10' : 'border-white/10'"
                :style="row.best && startRoll.winner === row.playerId ? { boxShadow: `0 0 22px -4px ${colorVar(row.player.color)}` } : undefined"
              >
                <UIcon :name="row.player.side === 'rebel' ? 'i-fa6-brands-rebel' : 'i-fa6-brands-empire'" class="size-6" :style="{ color: colorVar(row.player.color) }" />
                <span class="w-36 truncate text-lg font-semibold" :style="{ color: colorVar(row.player.color) }">{{ row.player.name }}</span>
                <div class="flex gap-2" :class="{ 'start-tumble': !row.values }">
                  <GameDie :value="row.values?.[0] ?? shuffled[0]" :side="row.player.side" :size="56" />
                  <GameDie :value="row.values?.[1] ?? shuffled[1]" :side="row.player.side" :size="56" />
                </div>
                <span class="ml-auto font-star-jedi text-3xl lowercase" :class="row.values ? 'text-white' : 'text-muted'">
                  {{ row.values ? row.values[0] + row.values[1] : '…' }}
                </span>
              </div>
            </div>
            <div v-if="r.tie" class="mt-2 text-center text-sm text-warning">Gleichstand – die Besten würfeln noch einmal!</div>
          </div>
        </div>

        <div class="mt-5 h-10 text-center">
          <Transition enter-active-class="transition duration-500" enter-from-class="scale-75 opacity-0">
            <div v-if="winner" class="text-2xl" :style="{ color: colorVar(winner.color) }">
              {{ winner.name }} {{ winner.kind === 'human' ? 'beginnst!' : 'beginnt!' }}
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.start-tumble {
  animation: start-tumble 0.5s ease-in-out infinite;
}
@keyframes start-tumble {
  0%, 100% { transform: rotate(0deg) translateY(0); }
  30% { transform: rotate(-10deg) translateY(-6px); }
  60% { transform: rotate(8deg) translateY(2px); }
}
@media (prefers-reduced-motion: reduce) {
  .start-tumble { animation: none; }
}
</style>

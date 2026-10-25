<script setup lang="ts">
// Big dice roll in the middle of the screen; afterwards the dice fly into their
// slots in the command bar (#dice-slot-0 / #dice-slot-1) and the result is committed.
const { diceRoll, activePlayer, commitRoll, ck } = useGalacticGame()
const { reduceMotion } = useGameSettings()

// Rebels roll two Rebel dice, Imperials two Imperial dice.
const SIDES = computed<Side[]>(() => [activePlayer.value.side, activePlayer.value.side])
// big dice in the center, smaller on phones
const SIZE = ref(168)
onMounted(() => { SIZE.value = Math.round(Math.min(168, window.innerWidth * 0.3, window.innerHeight * 0.3)) })

type Phase = 'idle' | 'rolling' | 'result' | 'fly'
const phase = ref<Phase>('idle')
const faces = ref<[number, number]>([1, 1])
/** Städte & Ritter: the event die rolls along (third slot). */
const eventFace = ref(1)
const withEvent = ref(false)
const flyStyle = ref<Record<string, string>[]>([{}, {}, {}])
const dieEls = ref<HTMLElement[]>([])
const eventEl = ref<HTMLElement | null>(null)
const sum = computed(() => faces.value[0] + faces.value[1])

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const rnd = () => 1 + Math.floor(Math.random() * 6)

// Resolves with the dice once the random source has answered (drand can take up to ~3 s).
function waitForValues(id: number): Promise<{ values: [number, number], event?: number } | null> {
  return new Promise((resolve) => {
    const check = (r: typeof diceRoll.value) => (r?.id !== id ? null : r.values ? { values: r.values, event: r.event } : undefined)
    const now = check(diceRoll.value)
    if (now !== undefined) return resolve(now)
    const stop = watch(() => diceRoll.value, (r) => {
      const v = check(r)
      if (v === undefined) return
      stop()
      resolve(v)
    })
  })
}

watch(() => diceRoll.value?.id, async (id) => {
  if (!id || !diceRoll.value) return
  const fast = reduceMotion.value

  flyStyle.value = [{}, {}, {}]
  withEvent.value = ck.value
  phase.value = 'rolling'
  const shuffle = setInterval(() => {
    faces.value = [rnd(), rnd()]
    eventFace.value = rnd()
  }, 85)
  const [result] = await Promise.all([waitForValues(id), wait(fast ? 150 : 600)])
  clearInterval(shuffle)
  if (!result) { phase.value = 'idle'; return }
  const final = result.values

  faces.value = final
  if (result.event) eventFace.value = result.event
  phase.value = 'result'
  await wait(fast ? 400 : 650)

  // FLIP: translate/scale each big die onto its slot in the command bar.
  flyStyle.value = [0, 1, 2].map((i): Record<string, string> => {
    const slot = document.getElementById(`dice-slot-${i}`)
    const die = i === 2 ? eventEl.value : dieEls.value[i]
    if (!slot || !die) return { opacity: '0', transition: 'opacity 300ms' }
    const t = slot.getBoundingClientRect()
    const d = die.getBoundingClientRect()
    const dx = t.left + t.width / 2 - (d.left + d.width / 2)
    const dy = t.top + t.height / 2 - (d.top + d.height / 2)
    return {
      transform: `translate(${dx}px, ${dy}px) scale(${t.width / d.width}) rotate(${i ? 8 : -8}deg)`,
      transition: `transform ${fast ? 1 : 450}ms cubic-bezier(0.6, 0, 0.25, 1)`,
    }
  })
  phase.value = 'fly'
  await wait(fast ? 50 : 450)

  phase.value = 'idle'
  // solo: the dice count now (in multiplayer the server commits them after the animation)
  commitRoll(final, result.event)
})
</script>

<template>
  <div
    v-if="phase !== 'idle'"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center transition-[background-color,backdrop-filter] duration-300"
    :class="phase === 'fly' ? 'pointer-events-none bg-transparent' : 'bg-black/45 backdrop-blur-[2px]'"
  >
    <div class="flex gap-6 sm:gap-10">
      <div
        v-for="(side, i) in SIDES"
        :key="i"
        ref="dieEls"
        :style="flyStyle[i]"
      >
        <div :class="{ 'dice-tumble': phase === 'rolling', 'dice-pop': phase === 'result' }" :style="{ animationDelay: `${i * 90}ms` }">
          <GameDie :value="faces[i]!" :side="side" :size="SIZE" :class="withEvent && i === 1 ? 'rounded-[20%] ring-4 ring-red-500' : ''" />
        </div>
      </div>
      <div v-if="withEvent" ref="eventEl" :style="flyStyle[2]">
        <div :class="{ 'dice-tumble': phase === 'rolling', 'dice-pop': phase === 'result' }" style="animation-delay: 180ms">
          <GameEventDie :value="eventFace" :size="Math.round(SIZE * 0.8)" />
        </div>
      </div>
    </div>

    <div
      class="mt-8 h-16 text-center transition-opacity duration-300"
      :class="phase === 'result' ? 'opacity-100' : 'opacity-0'"
    >
      <div class="font-star-jedi text-4xl text-primary lowercase sm:text-5xl">{{ sum }}</div>
      <div v-if="sum === 7" class="mt-1 text-lg text-error">Die Piraten schlagen zu!</div>
    </div>
  </div>
</template>

<style scoped>
.dice-tumble {
  animation: tumble 0.55s ease-in-out infinite;
}
.dice-pop {
  animation: pop 0.35s ease-out;
}
@keyframes tumble {
  0% { transform: translate(0, 0) rotate(0deg) scale(1); }
  25% { transform: translate(-14px, -22px) rotate(-18deg) scale(1.05); }
  50% { transform: translate(10px, 6px) rotate(14deg) scale(0.96); }
  75% { transform: translate(-6px, -12px) rotate(-8deg) scale(1.03); }
  100% { transform: translate(0, 0) rotate(0deg) scale(1); }
}
@keyframes pop {
  0% { transform: scale(1.18); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .dice-tumble, .dice-pop { animation: none; }
}
</style>

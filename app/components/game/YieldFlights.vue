<script setup lang="ts">
// Flying resource icons after a production roll: arc from the planet to the resource slot
// (own gains) or the player card (others). On landing the resource is credited, the target
// bumps and a "+1" floats up.
const flights = useYieldFlights()
const { applyGain } = useGalacticGame()

interface Floater { key: string, x: number, y: number, color: string }
const floaters = ref<Floater[]>([])

const { reduceMotion } = useGameSettings()

function launch(el: Element | null, flight: YieldFlight) {
  if (!(el instanceof HTMLElement) || el.dataset.launched) return
  el.dataset.launched = '1'
  const land = () => {
    applyGain(flight.playerId, flight.resource, 1)
    flights.value = flights.value.filter(f => f.key !== flight.key)
  }
  const targetEl = document.getElementById(flight.target)
  if (!targetEl || reduceMotion.value) {
    setTimeout(land, reduceMotion.value ? flight.delay / 3 : 0)
    return
  }
  const t = targetEl.getBoundingClientRect()
  const dx = t.left + t.width / 2 - flight.from.x
  const dy = t.top + t.height / 2 - flight.from.y
  // lift the arc away from the target direction (up for the bottom bar, down for the top bar)
  const lift = dy > 0 ? -140 : 120
  const anim = el.animate([
    { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.12 },
    { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.45 + lift}px)) scale(1.1)`, offset: 0.5 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${flight.small ? 0.45 : 0.75})`, opacity: 1 },
  ], { duration: 1050, delay: flight.delay, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'both' })
  anim.onfinish = () => {
    land()
    targetEl.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
      { duration: 280, easing: 'ease-out' },
    )
    const key = `${flight.key}-f`
    floaters.value.push({ key, x: t.left + t.width / 2, y: t.top, color: CARD_INFO[flight.resource].color })
    setTimeout(() => { floaters.value = floaters.value.filter(f => f.key !== key) }, 900)
  }
}

const flightRef = (flight: YieldFlight) => (el: unknown) => launch(el as Element | null, flight)
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-40">
    <img
      v-for="f in flights"
      :key="f.key"
      :ref="flightRef(f)"
      :src="`/images/resources/${f.resource}.png`"
      :alt="CARD_INFO[f.resource].name"
      class="absolute object-contain opacity-0 drop-shadow-[0_0_10px_rgb(255_255_255/0.45)]"
      :class="f.small ? 'size-10' : 'size-14'"
      :style="{ left: `${f.from.x}px`, top: `${f.from.y}px` }"
    >
    <span
      v-for="f in floaters"
      :key="f.key"
      class="yield-floater absolute -translate-x-1/2 text-xl font-bold"
      :style="{ left: `${f.x}px`, top: `${f.y}px`, color: f.color }"
    >+1</span>
  </div>
</template>

<style scoped>
.yield-floater {
  animation: rise 0.9s ease-out forwards;
  text-shadow: 0 0 8px rgb(0 0 0 / 0.8);
}
@keyframes rise {
  from { transform: translate(-50%, 0); opacity: 1; }
  to { transform: translate(-50%, -42px); opacity: 0; }
}
</style>

<script setup lang="ts">
import * as THREE from 'three'

// Lives inside the TresCanvas: turns each production roll into screen-space flights
// (planet on screen → resource slot / player card), rendered by game/YieldFlights.vue.
const { yieldEvent, me, tiles } = useGalacticGame()
const flights = useYieldFlights()
const { camera, renderer } = useTres()

const v = new THREE.Vector3()
function toScreen(x: number, z: number) {
  const cam = camera.value
  const rect = renderer.domElement.getBoundingClientRect()
  if (!cam) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  v.set(x, 0, z).project(cam)
  return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height }
}

watch(() => yieldEvent.value?.id, () => {
  const ev = yieldEvent.value
  if (!ev) return
  let delay = 350 // let the orbit flash start first
  for (const gain of ev.gains) {
    const [x, z] = tiles.value[gain.tile]!.center
    const from = toScreen(x, z)
    const target = gain.playerId === me.value.id ? `res-slot-${gain.resource}` : `player-card-${gain.playerId}`
    // one flying icon per resource unit
    for (let i = 0; i < gain.amount; i++) {
      flights.value.push({
        key: `${ev.id}-${flights.value.length}-${Math.random()}`,
        resource: gain.resource,
        playerId: gain.playerId,
        from: { x: from.x + (Math.random() - 0.5) * 30, y: from.y + (Math.random() - 0.5) * 30 },
        target,
        delay,
        small: gain.playerId !== me.value.id,
      })
      delay += 140
    }
  }
})
</script>

<template>
  <TresGroup />
</template>

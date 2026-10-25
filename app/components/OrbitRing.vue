<script setup lang="ts">
import * as THREE from 'three'

// Faint orbit circle around a system. Flashes in `flashColor` whenever `flashKey` changes.
const props = withDefaults(defineProps<{
  position: [number, number, number]
  radius: number
  flashKey?: number | null
  flashColor?: string
}>(), {
  flashKey: null,
  flashColor: '#ffffff',
})

const BASE_COLOR = new THREE.Color('#7fa8e0')
const BASE_OPACITY = 0.12

const material = new THREE.MeshBasicMaterial({
  color: BASE_COLOR.clone(),
  transparent: true,
  opacity: BASE_OPACITY,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
})
const geometry = computed(() => new THREE.RingGeometry(props.radius, props.radius + 0.01, 96))
const mesh = computed(() => {
  const m = new THREE.Mesh(geometry.value, material)
  m.rotation.x = -Math.PI / 2
  return m
})

let flashStart = -Infinity
const flash = new THREE.Color()
watch(() => props.flashKey, (k) => {
  if (k == null) return
  flashStart = performance.now()
  flash.set(props.flashColor)
})

const { onBeforeRender } = useLoop()
onBeforeRender(() => {
  const t = (performance.now() - flashStart) / 1000
  // quick flare-up, then ~2 s decay; the ring also widens a bit while it glows
  const k = t < 0 ? 0 : t < 0.15 ? t / 0.15 : Math.exp(-(t - 0.15) * 1.6)
  material.opacity = BASE_OPACITY + 0.85 * k
  material.color.copy(BASE_COLOR).lerp(flash, k)
  mesh.value.scale.setScalar(1 + 0.04 * k)
})
</script>

<template>
  <TresGroup :position="position">
    <primitive :object="mesh" />
  </TresGroup>
</template>

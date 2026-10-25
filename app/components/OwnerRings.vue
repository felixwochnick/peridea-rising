<script setup lang="ts">
import * as THREE from 'three'

// Glowing rings in the owner's color under every piece (one draw call), so ownership is
// readable at any zoom. Bright = active knight / structure, faint = inactive knight.
const props = withDefaults(defineProps<{
  items: { pos: [number, number], color: string, radius: number, strong?: boolean }[]
  y?: number
}>(), {
  y: 0.005,
})

const geometry = new THREE.RingGeometry(0.78, 1, 40).rotateX(-Math.PI / 2)
const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })

const mesh = computed(() => {
  const m = new THREE.InstancedMesh(geometry, material, Math.max(1, props.items.length))
  m.count = props.items.length
  const matrix = new THREE.Matrix4()
  const color = new THREE.Color()
  props.items.forEach((it, i) => {
    matrix.makeScale(it.radius, 1, it.radius).setPosition(it.pos[0], props.y, it.pos[1])
    m.setMatrixAt(i, matrix)
    m.setColorAt(i, color.set(playerColorHex(it.color)).multiplyScalar(it.strong === false ? 0.35 : 1))
  })
  m.frustumCulled = false
  return m
})
</script>

<template>
  <primitive :object="mesh" />
</template>

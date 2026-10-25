<script setup lang="ts">
import * as THREE from 'three'

// Pulsing orbit rings on every tile that can be picked (pirates: red; card effects: other colors).
const props = withDefaults(defineProps<{
  tiles: BoardTile[]
  targets: number[]
  radius: number
  color?: string
}>(), {
  color: '#ef4444',
})
const emit = defineEmits<{ pick: [tile: number] }>()

const hovered = ref<number | null>(null)
function enter(t: number) {
  hovered.value = t
  document.body.style.cursor = 'pointer'
}
function leave(t: number) {
  if (hovered.value === t) hovered.value = null
  document.body.style.cursor = ''
}
onBeforeUnmount(() => { document.body.style.cursor = '' })

const group = shallowRef<THREE.Group>()
const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }: { elapsed: number }) => {
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4)
  group.value?.traverse((o: THREE.Object3D) => {
    if (!(o instanceof THREE.Mesh) || o.userData.target === undefined) return
    const hot = o.userData.target === hovered.value
    ;(o.material as THREE.MeshBasicMaterial).opacity = hot ? 1 : 0.35 + 0.45 * pulse
    o.scale.setScalar(hot ? 1.08 : 1 + 0.03 * pulse)
  })
})
</script>

<template>
  <TresGroup ref="group">
    <TresGroup
      v-for="t in props.targets"
      :key="t"
      :position="[tiles[t]!.center[0], 0.01, tiles[t]!.center[1]]"
    >
      <TresMesh :rotation="[-Math.PI / 2, 0, 0]" :user-data="{ target: t }">
        <TresRingGeometry :args="[radius - 0.05, radius + 0.03, 64]" />
        <TresMeshBasicMaterial :color="color" :transparent="true" :side="THREE.DoubleSide" :depth-write="false" :blending="THREE.AdditiveBlending" />
      </TresMesh>
      <!-- invisible click area covering the system -->
      <TresMesh :rotation="[-Math.PI / 2, 0, 0]" @click="emit('pick', t)" @pointerenter="enter(t)" @pointerleave="leave(t)">
        <TresCircleGeometry :args="[radius + 0.05, 32]" />
        <TresMeshBasicMaterial :transparent="true" :opacity="0" :depth-write="false" :side="THREE.DoubleSide" />
      </TresMesh>
    </TresGroup>
  </TresGroup>
</template>

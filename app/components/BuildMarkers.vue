<script setup lang="ts">
import * as THREE from 'three'

// Pulsing markers for every valid build site of the selected build; click to place.
const props = withDefaults(defineProps<{
  board: Board
  mode: 'corner' | 'upgrade' | 'edge'
  /** Corner ids (corner/upgrade) or edge ids (edge). */
  sites: string[]
  color: string
  y?: number
  /** Height of the ship to upgrade (for the hit area). */
  shipY?: number
}>(), {
  y: 0.02,
  shipY: 0.14,
})

const emit = defineEmits<{ place: [siteId: string] }>()

const hex = computed(() => playerColorHex(props.color))
const hovered = ref<string | null>(null)

const markers = computed(() => props.sites.map((id) => {
  if (props.mode === 'edge') return { id, ...edgeTransform(props.board, id, props.y) }
  const [x, z] = props.board.corners[id]!.pos
  return { id, position: [x, props.y, z] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], length: 0 }
}))

function enter(id: string) {
  hovered.value = id
  document.body.style.cursor = 'pointer'
}
function leave(id: string) {
  if (hovered.value === id) hovered.value = null
  document.body.style.cursor = ''
}
onBeforeUnmount(() => { document.body.style.cursor = '' })

// Pulse without Vue re-renders: animate the visible marker meshes directly.
const group = shallowRef<THREE.Group>()
const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }: { elapsed: number }) => {
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4)
  group.value?.traverse((o: THREE.Object3D) => {
    if (!(o instanceof THREE.Mesh) || !o.userData.marker) return
    const hot = o.userData.site === hovered.value
    const mat = o.material as THREE.MeshBasicMaterial
    mat.opacity = hot ? 1 : 0.45 + 0.4 * pulse
    const s = hot ? 1.35 : 1 + 0.12 * pulse
    if (o.userData.marker === 'edge') o.scale.set(s, 1, s)
    else o.scale.setScalar(s)
  })
})
</script>

<template>
  <TresGroup ref="group">
    <TresGroup
      v-for="m in markers"
      :key="m.id"
      :position="m.position"
      :rotation="m.rotation"
    >
      <!-- Edge: glowing lane -->
      <template v-if="mode === 'edge'">
        <TresMesh :user-data="{ marker: 'edge', site: m.id }">
          <TresCylinderGeometry :args="[0.024, 0.024, m.length * 0.82, 10]" />
          <TresMeshBasicMaterial :color="hex" :transparent="true" :depth-write="false" :blending="THREE.AdditiveBlending" />
        </TresMesh>
        <!-- invisible, larger hit area -->
        <TresMesh @click="emit('place', m.id)" @pointerenter="enter(m.id)" @pointerleave="leave(m.id)">
          <TresCylinderGeometry :args="[0.09, 0.09, m.length * 0.8, 8]" />
          <TresMeshBasicMaterial :transparent="true" :opacity="0" :depth-write="false" />
        </TresMesh>
      </template>

      <!-- Corner / upgrade: flat pulsing ring -->
      <template v-else>
        <TresMesh :rotation="[-Math.PI / 2, 0, 0]" :user-data="{ marker: 'ring', site: m.id }">
          <TresRingGeometry :args="mode === 'upgrade' ? [0.26, 0.31, 48] : [0.08, 0.115, 40]" />
          <TresMeshBasicMaterial :color="hex" :transparent="true" :side="THREE.DoubleSide" :depth-write="false" :blending="THREE.AdditiveBlending" />
        </TresMesh>
        <TresMesh v-if="mode === 'corner'" :rotation="[-Math.PI / 2, 0, 0]" :user-data="{ marker: 'dot', site: m.id }">
          <TresCircleGeometry :args="[0.045, 24]" />
          <TresMeshBasicMaterial :color="hex" :transparent="true" :side="THREE.DoubleSide" :depth-write="false" :blending="THREE.AdditiveBlending" />
        </TresMesh>
        <TresMesh
          :position="[0, mode === 'upgrade' ? shipY : 0.05, 0]"
          @click="emit('place', m.id)"
          @pointerenter="enter(m.id)"
          @pointerleave="leave(m.id)"
        >
          <TresSphereGeometry :args="[mode === 'upgrade' ? 0.3 : 0.18, 12, 8]" />
          <TresMeshBasicMaterial :transparent="true" :opacity="0" :depth-write="false" />
        </TresMesh>
      </template>
    </TresGroup>
  </TresGroup>
</template>

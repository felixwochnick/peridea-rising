<script setup lang="ts">
import * as THREE from 'three'

// Subtle hyperlane network (Catan roads + settlement slots) in a Master of Orion style:
// the hex grid itself stays invisible, only its edges and corners are drawn as faint lines and rings.
const props = withDefaults(defineProps<{
  board: Board
  /** Claimed routes: edge id → player color. */
  routes?: { edge: string, color: string }[]
  y?: number
}>(), {
  routes: () => [],
  y: 0,
})

const LANE_COLOR = '#7fa8e0'

const claimed = computed(() => props.routes.map(r => ({ ...edgeTransform(props.board, r.edge, props.y), color: playerColorHex(r.color) })))

// The faint network is drawn with two instanced meshes (one draw call each) instead of
// one mesh per lane / corner – keeps the GPU load low.
const laneMaterial = new THREE.MeshBasicMaterial({ color: LANE_COLOR, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })
const ringMaterial = new THREE.MeshBasicMaterial({ color: LANE_COLOR, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
const laneGeometry = new THREE.CylinderGeometry(0.006, 0.006, 1, 6)
const ringGeometry = new THREE.RingGeometry(0.045, 0.06, 32).rotateX(-Math.PI / 2)

const network = computed(() => {
  const ids = Object.keys(props.board.edges)
  const corners = Object.values(props.board.corners)
  const lanes = new THREE.InstancedMesh(laneGeometry, laneMaterial, ids.length)
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, corners.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  ids.forEach((id, i) => {
    const t = edgeTransform(props.board, id, props.y)
    q.setFromEuler(e.set(...t.rotation))
    m.compose(new THREE.Vector3(...t.position), q, new THREE.Vector3(1, t.length, 1))
    lanes.setMatrixAt(i, m)
  })
  corners.forEach((c, i) => {
    m.makeTranslation(c.pos[0], props.y, c.pos[1])
    rings.setMatrixAt(i, m)
  })
  const g = new THREE.Group()
  g.add(lanes, rings)
  return g
})
</script>

<template>
  <TresGroup>
    <!-- Faint hyperlanes and corner nodes -->
    <primitive :object="network" />

    <!-- Claimed routes in player color -->
    <TresMesh
      v-for="(route, i) in claimed"
      :key="`route-${i}`"
      :position="route.position"
      :rotation="route.rotation"
    >
      <TresCylinderGeometry :args="[0.016, 0.016, route.length, 8]" />
      <TresMeshBasicMaterial
        :color="route.color"
        :transparent="true"
        :opacity="0.9"
        :depth-write="false"
        :blending="THREE.AdditiveBlending"
      />
    </TresMesh>
  </TresGroup>
</template>

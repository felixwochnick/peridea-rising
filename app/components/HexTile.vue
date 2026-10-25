<script setup lang="ts">
import * as THREE from 'three'

const props = withDefaults(defineProps<{
  position?: [number, number, number]
  size?: number
  tileColor?: string
  edgeColors?: (string | null)[]
}>(), {
  position: () => [0, 0, 0],
  size: 1,
  tileColor: '#0d1b2a',
  edgeColors: () => Array(6).fill(null),
})

const DEFAULT_EDGE_COLOR = '#1a3a6e'

const corners = computed(() => {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i
    return new THREE.Vector3(
      Math.cos(angle) * props.size,
      0,
      Math.sin(angle) * props.size,
    )
  })
})

const edgeData = computed(() => {
  return corners.value.map((corner, i) => {
    const next = corners.value[(i + 1) % 6]!
    const mid = new THREE.Vector3().addVectors(corner, next).multiplyScalar(0.5)
    const dir = new THREE.Vector3().subVectors(next, corner)
    const length = dir.length()
    const alpha = Math.atan2(dir.z, dir.x)
    const active = props.edgeColors[i] != null

    return {
      position: [mid.x, 0.04, mid.z] as [number, number, number],
      length,
      // Cylinder is along Y by default.
      // Rotate X by PI/2 → lies along Z, then Y by (PI/2 - alpha) → points along edge direction.
      rotation: [Math.PI / 2, Math.PI / 2 - alpha, 0] as [number, number, number],
      color: props.edgeColors[i] ?? DEFAULT_EDGE_COLOR,
      emissiveIntensity: active ? 1.5 : 0.15,
    }
  })
})
</script>

<template>
  <TresGroup :position="position">
    <!-- Hex face -->
    <TresMesh>
      <TresCylinderGeometry :args="[size, size, 0.06, 6]" />
      <TresMeshStandardMaterial
        :color="tileColor"
        :roughness="0.6"
        :metalness="0.4"
        :transparent="true"
        :opacity="0.85"
      />
    </TresMesh>

    <!-- Hyperraum Routen (6 edges) -->
    <TresMesh
      v-for="(edge, i) in edgeData"
      :key="i"
      :position="edge.position"
      :rotation="edge.rotation"
    >
      <TresCylinderGeometry :args="[0.035, 0.035, edge.length, 8]" />
      <TresMeshStandardMaterial
        :color="edge.color"
        :emissive="edge.color"
        :emissive-intensity="edge.emissiveIntensity"
        :roughness="0.1"
        :metalness="0.9"
      />
    </TresMesh>

    <!-- Corner nodes (planet slots) -->
    <TresMesh
      v-for="(corner, i) in corners"
      :key="`corner-${i}`"
      :position="[corner.x, 0.06, corner.z]"
    >
      <TresSphereGeometry :args="[0.07, 12, 12]" />
      <TresMeshStandardMaterial
        color="#223355"
        :emissive="'#334466'"
        :emissive-intensity="0.4"
        :roughness="0.2"
        :metalness="0.8"
      />
    </TresMesh>
  </TresGroup>
</template>

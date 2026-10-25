<script setup lang="ts">
import * as THREE from 'three'

// Seafarers gold field as a golden trade nexus: glowing core with two tilted rotating rings.
// The owner of an adjacent outpost picks any resource when it produces.
withDefaults(defineProps<{
  position?: [number, number, number]
  radius?: number
}>(), {
  position: () => [0, 0, 0],
  radius: 0.38,
})

const ringA = shallowRef<THREE.Mesh>()
const ringB = shallowRef<THREE.Mesh>()
const core = shallowRef<THREE.Mesh>()
const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed, delta }: { elapsed: number, delta: number }) => {
  if (ringA.value) ringA.value.rotation.z += 0.5 * delta
  if (ringB.value) ringB.value.rotation.z -= 0.35 * delta
  if (core.value) core.value.scale.setScalar(1 + 0.04 * Math.sin(elapsed * 2.2))
})
</script>

<template>
  <TresGroup :position="position">
    <TresMesh ref="core">
      <TresIcosahedronGeometry :args="[radius * 0.62, 2]" />
      <TresMeshStandardMaterial color="#f5c542" emissive="#ffb300" :emissive-intensity="1.1" :metalness="0.9" :roughness="0.25" :flat-shading="true" />
    </TresMesh>
    <!-- soft glow -->
    <TresMesh :scale="1.5">
      <TresSphereGeometry :args="[radius * 0.62, 32, 16]" />
      <TresMeshBasicMaterial color="#ffcc33" :transparent="true" :opacity="0.12" :depth-write="false" :blending="THREE.AdditiveBlending" />
    </TresMesh>
    <TresMesh ref="ringA" :rotation="[Math.PI / 2.4, 0, 0]">
      <TresTorusGeometry :args="[radius * 1.05, 0.022, 8, 64]" />
      <TresMeshStandardMaterial color="#ffd36b" emissive="#ffb300" :emissive-intensity="0.8" :metalness="1" :roughness="0.3" />
    </TresMesh>
    <TresMesh ref="ringB" :rotation="[Math.PI / 1.7, 0.6, 0]">
      <TresTorusGeometry :args="[radius * 0.85, 0.014, 8, 64]" />
      <TresMeshStandardMaterial color="#ffe9a8" emissive="#ffcc33" :emissive-intensity="0.6" :metalness="1" :roughness="0.3" />
    </TresMesh>
  </TresGroup>
</template>

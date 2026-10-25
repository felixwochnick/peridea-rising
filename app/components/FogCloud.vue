<script setup lang="ts">
import * as THREE from 'three'

// Unexplored fog tile: a slowly drifting nebula of soft sprites. Revealed by building next to it.
const props = withDefaults(defineProps<{
  position?: [number, number, number]
  size?: number
  seed?: number
}>(), {
  position: () => [0, 0, 0],
  size: 1.9,
  seed: 0,
})

let texture: THREE.CanvasTexture | null = null
function cloudTexture() {
  if (texture) return texture
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.4
    const y = S / 2 + (Math.random() - 0.5) * S * 0.4
    const r = S * (0.18 + Math.random() * 0.22)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.35)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
  }
  texture = new THREE.CanvasTexture(canvas)
  return texture
}

const COLORS = ['#5b4a8a', '#3e5a8a', '#6a3f7a', '#2f4f6f']
const group = computed(() => {
  const g = new THREE.Group()
  for (let i = 0; i < 6; i++) {
    const a = props.seed * 1.7 + i * 1.05
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTexture(),
      color: COLORS[(i + props.seed) % COLORS.length],
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
    sprite.position.set(Math.cos(a) * props.size * 0.18, 0.05 + (i % 3) * 0.06, Math.sin(a) * props.size * 0.18)
    sprite.scale.setScalar(props.size * (0.75 + (i % 3) * 0.15))
    sprite.material.rotation = a
    g.add(sprite)
  }
  return g
})

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }: { delta: number }) => {
  group.value.children.forEach((s: THREE.Object3D, i: number) => {
    (s as THREE.Sprite).material.rotation += (i % 2 ? 0.05 : -0.04) * delta
  })
})
</script>

<template>
  <TresGroup :position="position">
    <primitive :object="group" />
  </TresGroup>
</template>

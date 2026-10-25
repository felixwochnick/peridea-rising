<script setup lang="ts">
import * as THREE from 'three'

// Catan number tokens. Each token floats between its planet and the orbit circle,
// always on the side facing the camera, and always faces the camera (sprite).
const props = withDefaults(defineProps<{
  tokens: { center: [number, number], number: number }[]
  /** Distance from the system center (between planet surface and orbit). */
  radius?: number
  size?: number
  y?: number
  visible?: boolean
}>(), {
  radius: 0.66,
  size: 0.24,
  y: 0.12,
  visible: true,
})

// Number of probability pips under the number, like on the Catan tokens.
const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }

const textureCache = new Map<number, THREE.CanvasTexture>()
function tokenTexture(n: number): THREE.CanvasTexture {
  if (textureCache.has(n)) return textureCache.get(n)!
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  const hot = n === 6 || n === 8
  const accent = hot ? '#ff5a4f' : '#ffe81f'
  // disc
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(8, 14, 28, 0.88)'; ctx.fill()
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(127, 168, 224, 0.9)'; ctx.stroke()
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 20, 0, Math.PI * 2)
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(127, 168, 224, 0.35)'; ctx.stroke()
  // number
  ctx.fillStyle = hot ? accent : '#ffffff'
  ctx.font = `bold ${n >= 10 ? 104 : 118}px system-ui, sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(String(n), S / 2, S / 2 - 12)
  // pips
  const pips = PIPS[n] ?? 0
  for (let i = 0; i < pips; i++) {
    ctx.beginPath(); ctx.arc(S / 2 + (i - (pips - 1) / 2) * 20, S / 2 + 62, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = accent; ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  textureCache.set(n, tex)
  return tex
}

const toCamera = new THREE.Vector3()
const group = computed(() => {
  const g = new THREE.Group()
  for (const t of props.tokens) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tokenTexture(t.number), depthTest: false, transparent: true }))
    sprite.scale.setScalar(props.size)
    sprite.renderOrder = 10
    sprite.frustumCulled = false
    // Re-position right before drawing so the token always sits on the camera side of its planet.
    sprite.onBeforeRender = (_r: THREE.WebGLRenderer, _s: THREE.Scene, camera: THREE.Camera) => {
      toCamera.set(camera.position.x - t.center[0], 0, camera.position.z - t.center[1])
      if (toCamera.lengthSq() < 1e-6) toCamera.set(0, 0, 1)
      toCamera.normalize().multiplyScalar(props.radius)
      sprite.position.set(t.center[0] + toCamera.x, props.y, t.center[1] + toCamera.z)
      sprite.updateMatrixWorld()
    }
    g.add(sprite)
  }
  return g
})

watchEffect(() => { group.value.visible = props.visible })
</script>

<template>
  <primitive :object="group" />
</template>

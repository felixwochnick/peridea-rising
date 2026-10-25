<script setup lang="ts">
import * as THREE from 'three'

// Trade stations (Catan harbors): an XQ1 platform off the coast, two docking lines to
// the corners that get the rate, and a "2:1" / "3:1" sign that always faces the camera.
const props = withDefaults(defineProps<{
  harbors: Harbor[]
  board: Board
  y?: number
  /** Height of the docking lines (same plane as the hyperlanes). */
  lineY?: number
  /** Player color per harbor edge (owner of a structure at its corners) – highlights the docking lines. */
  owners?: Record<string, string | undefined>
}>(), {
  y: 0.14,
  lineY: 0,
  owners: () => ({}),
})

const iconCache = new Map<string, HTMLImageElement>()
/** Calls `onLoad` with the resource icon once it is loaded (immediately if cached). */
function withIcon(r: ResourceId, onLoad: (img: HTMLImageElement) => void) {
  let img = iconCache.get(r)
  if (!img) {
    img = new Image()
    img.src = `/images/resources/${r}.png`
    iconCache.set(r, img)
  }
  const loaded = img
  if (loaded.complete && loaded.naturalWidth) onLoad(loaded)
  else loaded.addEventListener('load', () => onLoad(loaded), { once: true })
}

function signTexture(h: Harbor) {
  const W = 256
  const H = 128
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const accent = h.resource ? RESOURCES[h.resource].color : '#7fa8e0'
  const draw = (img?: HTMLImageElement) => {
    ctx.clearRect(0, 0, W, H)
    ctx.beginPath()
    ctx.roundRect(6, 14, W - 12, H - 28, 46)
    ctx.fillStyle = 'rgba(8, 14, 28, 0.88)'
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = accent
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 64px system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    if (img) {
      ctx.textAlign = 'right'
      ctx.fillText(`${harborRate(h)}:1`, W / 2 + 22, H / 2 + 2)
      ctx.drawImage(img, W / 2 + 30, H / 2 - 38, 76, 76)
    }
    else {
      ctx.textAlign = 'center'
      ctx.fillText(`${harborRate(h)}:1`, W / 2, H / 2 + 2)
    }
    tex.needsUpdate = true
  }
  draw()
  if (h.resource) withIcon(h.resource, draw)
  return tex
}

const group = computed(() => {
  const g = new THREE.Group()
  for (const h of props.harbors) {
    const owner = props.owners[h.edge]
    const color = owner ? playerColorHex(owner) : (h.resource ? RESOURCES[h.resource].color : '#7fa8e0')
    // docking lines to both corners
    for (const c of h.corners) {
      const [x, z] = props.board.corners[c]!.pos
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(h.pos[0], props.lineY, h.pos[1]),
        new THREE.Vector3(x, props.lineY, z),
      ])
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: owner ? 0.9 : 0.55 }))
      line.computeLineDistances()
      g.add(line)
    }
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture(h), transparent: true, depthTest: false }))
    sign.scale.set(0.56, 0.28, 1)
    sign.position.set(h.pos[0], props.y + 0.42, h.pos[1])
    sign.renderOrder = 9
    g.add(sign)
  }
  return g
})
</script>

<template>
  <primitive :object="group" />
  <Ship
    v-for="h in harbors"
    :key="h.edge"
    type="trade-station"
    :length="0.6"
    :position="[h.pos[0], y, h.pos[1]]"
    :spin="0.08"
  />
</template>

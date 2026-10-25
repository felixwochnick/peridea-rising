<script setup lang="ts">
import * as THREE from 'three'

// RTS-style camera: orbit/zoom with the mouse, plus edge scrolling and WASD/arrow panning.
// Zoom, tilt and panning are clamped so the board can't be lost.
const props = withDefaults(defineProps<{
  minDistance?: number
  maxDistance?: number
  /** Max distance of the look-at target from the board center. */
  panLimit?: number
  /** Edge-scroll zone in pixels. */
  edge?: number
  speed?: number
}>(), {
  minDistance: 3,
  maxDistance: 14,
  panLimit: 6,
  edge: 36,
  speed: 0.9,
})

// cientos exposes the three.js OrbitControls as `instance` (refs are unwrapped on the component proxy).
interface Controls { object: THREE.Camera, target: THREE.Vector3, domElement: HTMLElement | null, update: () => void }
const controlsRef = shallowRef<{ instance: Controls | null }>()
const controls = computed(() => controlsRef.value?.instance ?? null)

// Edge scroll intensity in [-1, 1] per axis, from the pointer position over the canvas.
const { settings } = useGameSettings()
const menuOpen = useState('gc-menu', () => false)

const edgeX = ref(0)
const edgeY = ref(0)
const keys = new Set<string>()
// While the mouse is caught in fullscreen, the edge is taken from the drawn cursor –
// anywhere along the edge, also over the HUD bars.
const trap = useVirtualCursor()

/** -1 / +1 near the low / high end of [min, max], fading to 0 over the edge zone. */
function edgeAxis(p: number, min: number, max: number) {
  const ramp = (d: number) => Math.max(0, 1 - d / props.edge)
  return ramp(p - min) > 0 ? -ramp(p - min) : ramp(max - p)
}

function onPointerMove(e: PointerEvent) {
  const el = controls.value?.domElement
  // edge scrolling only with a mouse (not with touch / pen)
  if (!el || e.target !== el || e.pointerType !== 'mouse' || !settings.value.edgeScroll || trap.locked) { edgeX.value = edgeY.value = 0; return }
  const r = el.getBoundingClientRect()
  edgeX.value = edgeAxis(e.clientX, r.left, r.right)
  edgeY.value = edgeAxis(e.clientY, r.top, r.bottom)
}
function stopEdge() { edgeX.value = edgeY.value = 0 }
function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.closest?.('input, textarea')) return
  if (e.type === 'keydown') keys.add(e.key.toLowerCase())
  else keys.delete(e.key.toLowerCase())
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  document.documentElement.addEventListener('mouseleave', stopEdge)
  window.addEventListener('blur', stopEdge)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  document.documentElement.removeEventListener('mouseleave', stopEdge)
  window.removeEventListener('blur', stopEdge)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKey)
})

// Touch: one finger pans the map (like Catan Universe), two fingers zoom and rotate.
watch(controls, (c) => {
  if (c) (c as unknown as { touches: Record<string, number> }).touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
}, { immediate: true })

// Also clamp right-mouse panning of the OrbitControls.
function clampTarget() {
  const c = controls.value
  if (!c) return
  const t = c.target
  const flat = new THREE.Vector3(t.x, 0, t.z)
  if (flat.length() <= props.panLimit) return
  const correction = flat.clone().setLength(props.panLimit).sub(flat)
  t.add(correction)
  c.object.position.add(correction)
}

const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const move = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }: { delta: number }) => {
  const c = controls.value
  if (!c || menuOpen.value) return
  let x = edgeX.value
  let y = edgeY.value
  if (trap.locked) {
    // the drawn cursor stops at the last pixel, so measure against the last pixel
    x = settings.value.edgeScroll ? edgeAxis(trap.x, 0, window.innerWidth - 1) : 0
    y = settings.value.edgeScroll ? edgeAxis(trap.y, 0, window.innerHeight - 1) : 0
  }
  if (keys.has('a') || keys.has('arrowleft')) x = -1
  if (keys.has('d') || keys.has('arrowright')) x = 1
  if (keys.has('w') || keys.has('arrowup')) y = -1
  if (keys.has('s') || keys.has('arrowdown')) y = 1
  if (x === 0 && y === 0) return

  const camera = c.object
  const target = c.target
  forward.subVectors(target, camera.position).setY(0).normalize()
  right.crossVectors(forward, UP).normalize()
  // Faster when zoomed out, like in strategy games.
  const step = camera.position.distanceTo(target) * props.speed * settings.value.scrollSpeed * Math.min(delta, 0.05)
  move.copy(right).multiplyScalar(x * step).addScaledVector(forward, -y * step)

  // Keep the target inside the pan limit.
  const next = target.clone().add(move).setY(target.y)
  if (next.length() > props.panLimit) move.add(next.clone().setLength(props.panLimit).sub(next))
  camera.position.add(move)
  target.add(move)
  c.update()
})
</script>

<template>
  <OrbitControls
    ref="controlsRef"
    make-default
    :enable-damping="true"
    :damping-factor="0.08"
    :min-distance="minDistance"
    :max-distance="maxDistance"
    :min-polar-angle="0.25"
    :max-polar-angle="Math.PI / 2.3"
    :enable-pan="true"
    :screen-space-panning="false"
    @change="clampTarget"
  />
</template>

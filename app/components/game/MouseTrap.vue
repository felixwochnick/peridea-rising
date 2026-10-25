<script setup lang="ts">
// Option "Maus im Vollbild fangen": browsers can only keep the cursor inside the window via
// Pointer Lock, which hides it and freezes its coordinates. So while locked we draw our own
// cursor, move it by the raw mouse movement and replay every mouse event at its position –
// edge scrolling then also works with a second monitor next to the game.
// Esc releases the mouse (browser rule), the next click catches it again.
const { settings } = useGameSettings()
const { isFullscreen } = useGameFullscreen()

const active = computed(() => settings.value.mouseTrap && isFullscreen.value)
const locked = ref(false)
const hand = ref(false)
const cursorEl = ref<HTMLElement>()

/** Shared with the camera, which edge-scrolls from it. */
const pos = useVirtualCursor()
/** Events we dispatched ourselves – not intercepted again. */
const synthetic = new WeakSet<Event>()
let hovered: Element | null = null
/** Emulated pointer capture (the real one is not allowed during pointer lock). */
let captured: Element | null = null
let pressed: Element | null = null
let lastClick = { at: 0, target: null as Element | null }

function requestLock() {
  if (!active.value || locked.value) return
  try {
    // returns a promise in Chromium, undefined in Safari; fails e.g. right after Esc
    Promise.resolve(document.documentElement.requestPointerLock()).catch(onLockError)
  }
  catch { onLockError() /* not allowed right now – the next click tries again */ }
}

function onLockChange() {
  locked.value = pos.locked = document.pointerLockElement === document.documentElement
  if (locked.value) {
    hovered = null
    moveCursor()
  }
  else {
    hovered = captured = pressed = null
  }
}

function moveCursor() {
  if (cursorEl.value) cursorEl.value.style.transform = `translate(${pos.x}px, ${pos.y}px)`
}

// --- replaying events --------------------------------------------------------------
type Extra = PointerEventInit & WheelEventInit

function fire(type: string, target: Element, src: MouseEvent, extra: Extra = {}) {
  const init: Extra = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: pos.x,
    clientY: pos.y,
    screenX: pos.x,
    screenY: pos.y,
    movementX: src.movementX,
    movementY: src.movementY,
    button: src.button,
    buttons: src.buttons,
    ctrlKey: src.ctrlKey,
    shiftKey: src.shiftKey,
    altKey: src.altKey,
    metaKey: src.metaKey,
    pointerId: (src as PointerEvent).pointerId ?? 1,
    pointerType: 'mouse',
    isPrimary: true,
    ...extra,
  }
  const ev = type.startsWith('pointer') || type.endsWith('pointercapture')
    ? new PointerEvent(type, init)
    : type === 'wheel' ? new WheelEvent(type, init) : new MouseEvent(type, init)
  synthetic.add(ev)
  target.dispatchEvent(ev)
  return ev
}

function ancestors(el: Element | null) {
  const list: Element[] = []
  for (let n = el; n; n = n.parentElement) list.push(n)
  return list
}

/** over/out/enter/leave, like the browser does when the cursor crosses elements. */
function updateHover(src: MouseEvent) {
  const el = document.elementFromPoint(pos.x, pos.y)
  if (el === hovered) return
  const old = hovered
  hovered = el
  hand.value = !!el && getComputedStyle(el).cursor === 'pointer'
  const oldChain = ancestors(old)
  const newChain = ancestors(el)
  const quiet = { bubbles: false, cancelable: false }
  if (old) {
    fire('pointerout', old, src, { relatedTarget: el })
    fire('mouseout', old, src, { relatedTarget: el })
    for (const n of oldChain.filter(n => !newChain.includes(n))) {
      fire('pointerleave', n, src, { ...quiet, relatedTarget: el })
      fire('mouseleave', n, src, { ...quiet, relatedTarget: el })
    }
  }
  if (el) {
    fire('pointerover', el, src, { relatedTarget: old })
    fire('mouseover', el, src, { relatedTarget: old })
    for (const n of newChain.filter(n => !oldChain.includes(n)).reverse()) {
      fire('pointerenter', n, src, { ...quiet, relatedTarget: old })
      fire('mouseenter', n, src, { ...quiet, relatedTarget: old })
    }
  }
}

const FOCUSABLE = 'input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"]), [contenteditable]'

function onPointerMove(e: PointerEvent) {
  pos.x = Math.min(window.innerWidth - 1, Math.max(0, pos.x + e.movementX))
  pos.y = Math.min(window.innerHeight - 1, Math.max(0, pos.y + e.movementY))
  moveCursor()
  updateHover(e)
  const target = captured ?? hovered
  if (!target) return
  fire('pointermove', target, e)
  fire('mousemove', target, e)
}

function onPointerDown(e: PointerEvent) {
  updateHover(e)
  const target = hovered
  if (!target) return
  pressed = target
  const down = fire('pointerdown', target, e)
  if (down.defaultPrevented) return
  const md = fire('mousedown', target, e, { detail: 1 })
  if (!md.defaultPrevented) {
    const focusable = target.closest<HTMLElement>(FOCUSABLE)
    if (focusable) focusable.focus()
    else (document.activeElement as HTMLElement | null)?.blur?.()
  }
  if (e.button === 2) fire('contextmenu', target, e)
}

function onPointerUp(e: PointerEvent) {
  updateHover(e)
  const target = captured ?? hovered
  const releasedCapture = captured
  captured = null
  if (releasedCapture) fire('lostpointercapture', releasedCapture, e, { bubbles: true, cancelable: false })
  if (!target) return
  fire('pointerup', target, e)
  fire('mouseup', target, e)
  // click goes to the element that was both pressed and released on (or their common parent)
  const under = hovered
  const clickTarget = pressed && under ? ancestors(under).find(n => n.contains(pressed!)) : null
  pressed = null
  if (!clickTarget) return
  if (e.button === 0) {
    const now = performance.now()
    const double = now - lastClick.at < 400 && lastClick.target === clickTarget
    fire('click', clickTarget, e, { detail: double ? 2 : 1 })
    if (double) fire('dblclick', clickTarget, e, { detail: 2 })
    lastClick = { at: double ? 0 : now, target: clickTarget }
  }
  else if (e.button === 1) fire('auxclick', clickTarget, e)
}

function scrollParent(el: Element | null) {
  for (let n = el; n; n = n.parentElement) {
    const { overflowY, overflowX } = getComputedStyle(n)
    if ((/auto|scroll/.test(overflowY) && n.scrollHeight > n.clientHeight) || (/auto|scroll/.test(overflowX) && n.scrollWidth > n.clientWidth)) return n
  }
  return null
}

function onWheel(e: WheelEvent) {
  const target = hovered ?? document.elementFromPoint(pos.x, pos.y)
  if (!target) return
  const ev = fire('wheel', target, e, { deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode })
  // synthetic wheel events don't scroll by themselves
  if (!ev.defaultPrevented) {
    const k = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1
    scrollParent(target)?.scrollBy({ left: e.deltaX * k, top: e.deltaY * k })
  }
}

/** Real mouse events: while locked they all carry frozen coordinates, so they are swallowed and replayed. */
function intercept(e: Event) {
  if (synthetic.has(e)) return
  if (!locked.value) {
    // first click in fullscreen catches the mouse, and the cursor starts where the real one was
    if (e.type === 'pointerdown' && (e as PointerEvent).pointerType === 'mouse' && e.isTrusted && active.value) {
      pos.x = (e as PointerEvent).clientX
      pos.y = (e as PointerEvent).clientY
      // the press that catches the mouse is handled normally, its release is replayed: send it to the same element
      captured = pressed = e.target as Element
      requestLock()
    }
    else if (e.type === 'pointerup') captured = pressed = null
    else if (e.type === 'pointermove') {
      pos.x = (e as PointerEvent).clientX
      pos.y = (e as PointerEvent).clientY
    }
    return
  }
  if (e instanceof PointerEvent && e.pointerType !== 'mouse') return
  e.stopImmediatePropagation()
  e.preventDefault()
  if (e.type === 'pointermove') onPointerMove(e as PointerEvent)
  else if (e.type === 'pointerdown') onPointerDown(e as PointerEvent)
  else if (e.type === 'pointerup') onPointerUp(e as PointerEvent)
  else if (e.type === 'wheel') onWheel(e as WheelEvent)
}

const INTERCEPTED = [
  'pointermove', 'pointerdown', 'pointerup', 'wheel',
  'mousemove', 'mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu',
  'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave',
]

function onLockError() { captured = pressed = null }

// Pointer capture throws while the pointer is locked (OrbitControls, sliders use it): emulate it.
let native: Pick<Element, 'setPointerCapture' | 'releasePointerCapture' | 'hasPointerCapture'> | null = null

onMounted(() => {
  const proto = Element.prototype
  native = { setPointerCapture: proto.setPointerCapture, releasePointerCapture: proto.releasePointerCapture, hasPointerCapture: proto.hasPointerCapture }
  const { setPointerCapture: set, releasePointerCapture: release, hasPointerCapture: has } = native
  proto.setPointerCapture = function (id) { if (locked.value) captured = this; else set.call(this, id) }
  proto.releasePointerCapture = function (id) { if (locked.value) { if (captured === this) captured = null } else release.call(this, id) }
  proto.hasPointerCapture = function (id) { return locked.value ? captured === this : has.call(this, id) }
  for (const t of INTERCEPTED) window.addEventListener(t, intercept, { capture: true, passive: false })
  document.addEventListener('pointerlockchange', onLockChange)
  document.addEventListener('pointerlockerror', onLockError)
  requestLock()
})

onBeforeUnmount(() => {
  if (native) Object.assign(Element.prototype, native)
  for (const t of INTERCEPTED) window.removeEventListener(t, intercept, { capture: true })
  document.removeEventListener('pointerlockchange', onLockChange)
  document.removeEventListener('pointerlockerror', onLockError)
  if (locked.value) document.exitPointerLock()
  pos.locked = false
})

// entering fullscreen (F key, button, game start) catches the mouse right away; leaving it or turning the option off releases it
watch(active, (on) => {
  if (on) requestLock()
  else if (locked.value) document.exitPointerLock()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="locked"
      ref="cursorEl"
      class="pointer-events-none fixed left-0 top-0 z-[2147483647] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
      aria-hidden="true"
    >
      <UIcon v-if="hand" name="i-lucide-pointer" class="size-6 -translate-x-[9px] -translate-y-px text-white" />
      <svg v-else width="20" height="22" viewBox="0 0 20 22" class="block">
        <path d="M1.5 1.5v16l4.2-4.1 2.9 6.6 2.6-1.1-2.9-6.5h5.9z" fill="white" stroke="black" stroke-width="1.3" stroke-linejoin="round" />
      </svg>
    </div>
  </Teleport>
</template>

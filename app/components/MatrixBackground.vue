<script setup lang="ts">
const props = withDefaults(defineProps<{ color?: string }>(), { color: 'yellow' })

const canvas = ref<HTMLCanvasElement | null>(null)

const FONTS = ['Aurebesh', 'Huttese']
const FONT_SIZE = 18

const CHARS = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i))

function randomChar(): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)] ?? '?'
}

/** Resolves a Tailwind CSS color variable to an rgb() string via a DOM element. */
function resolveColor(shade: number): string {
  const div = document.createElement('div')
  div.style.display = 'none'
  div.style.color = `var(--color-${props.color}-${shade})`
  document.body.appendChild(div)
  const resolved = getComputedStyle(div).color
  // Falls back to white if the variable doesn't exist (returns transparent/black)
  return resolved === 'rgba(0, 0, 0, 0)' || resolved === 'rgb(0, 0, 0)' ? '#ffffff' : resolved
}

let cachedColor = ''

function getBaseColor(): string {
  if (!cachedColor) cachedColor = resolveColor(400)
  return cachedColor
}

watch(() => props.color, () => { cachedColor = '' })

onMounted(() => {
  const el = canvas.value!
  const ctx = el.getContext('2d')!
  let animId: number

  function resize() {
    el.width = el.offsetWidth
    el.height = el.offsetHeight
    init()
  }

  const cols: { x: number; y: number; speed: number; font: string; chars: string[]; length: number }[] = []

  function init() {
    cols.length = 0
    const count = Math.floor(el.width / (FONT_SIZE * 1.2))
    for (let i = 0; i < count; i++) cols.push(spawnCol(i, true))
  }

  function spawnCol(index: number, scattered = false) {
    const length = 6 + Math.floor(Math.random() * 16)
    return {
      x: index * FONT_SIZE * 1.2,
      y: scattered ? Math.random() * el.height - el.height : -FONT_SIZE * length,
      speed: 0.6 + Math.random() * 1.4,
      font: FONTS[Math.floor(Math.random() * FONTS.length)]!,
      chars: Array.from<string>({ length }).map(randomChar),
      length,
    }
  }

  function draw() {
    const baseColor = getBaseColor()

    // Fade out existing pixels without adding a background color
    ctx.globalCompositeOperation = 'destination-out'
    ctx.globalAlpha = 0.18
    ctx.fillRect(0, 0, el.width, el.height)
    ctx.globalCompositeOperation = 'source-over'

    for (let c = 0; c < cols.length; c++) {
      const col = cols[c]!
      col.y += col.speed

      if (Math.random() < 0.04) {
        col.chars[Math.floor(Math.random() * col.chars.length)] = randomChar()
      }

      for (let i = 0; i < col.chars.length; i++) {
        const charY = col.y - i * FONT_SIZE
        if (charY < -FONT_SIZE || charY > el.height + FONT_SIZE) continue

        const progress = i / col.chars.length
        ctx.font = `${FONT_SIZE}px "${col.font}"`
        ctx.fillStyle = baseColor

        if (i === 0) {
          ctx.globalAlpha = 1
          ctx.shadowColor = baseColor
          ctx.shadowBlur = 10
        } else if (progress < 0.3) {
          ctx.globalAlpha = 0.6
          ctx.shadowBlur = 0
        } else {
          ctx.globalAlpha = 0.15
          ctx.shadowBlur = 0
        }

        ctx.fillText(col.chars[i] ?? '', col.x, charY)
      }

      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      if (col.y - col.length * FONT_SIZE > el.height) {
        cols[c] = spawnCol(c)
      }
    }

    animId = requestAnimationFrame(draw)
  }

  const ro = new ResizeObserver(resize)
  ro.observe(el)
  resize()
  draw()

  onUnmounted(() => {
    cancelAnimationFrame(animId)
    ro.disconnect()
  })
})
</script>

<template>
  <canvas ref="canvas" class="fixed inset-0 w-full h-full -z-10" />
</template>

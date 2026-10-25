<script setup lang="ts">
// Map template selection for the lobby, with a small SVG preview of each map
// (islands, empty space, gold fields and fog).
const model = defineModel<string>({ required: true })
const props = defineProps<{ playerCount: number }>()

const HEX = 1
function hexPoints(cx: number, cy: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i
    return `${(cx + Math.cos(a) * HEX * 0.92).toFixed(2)},${(cy + Math.sin(a) * HEX * 0.92).toFixed(2)}`
  }).join(' ')
}

const FILL = {
  land: { on: 'rgb(253 199 0 / 0.22)', off: 'rgb(127 168 224 / 0.18)' },
  gold: { on: 'rgb(255 179 0 / 0.75)', off: 'rgb(255 179 0 / 0.5)' },
  fog: { on: 'rgb(147 112 219 / 0.35)', off: 'rgb(147 112 219 / 0.25)' },
  sea: { on: 'rgb(255 255 255 / 0.03)', off: 'rgb(255 255 255 / 0.02)' },
} as const

const previews = computed(() => MAP_TEMPLATES.map((t) => {
  const pts = t.cells.map(c => ({ kind: c.kind, pos: axialToWorld(c.axial, HEX) }))
  const xs = pts.map(p => p.pos[0])
  const ys = pts.map(p => p.pos[1])
  const pad = HEX * 1.1
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const count = (k: string) => t.cells.filter(c => c.kind === k).length
  return {
    template: t,
    viewBox: `${minX} ${minY} ${Math.max(...xs) - minX + pad} ${Math.max(...ys) - minY + pad}`,
    hexes: pts.map(p => ({ kind: p.kind, points: hexPoints(p.pos[0], p.pos[1]) })),
    land: count('land') + count('gold'),
    gold: count('gold'),
    fog: count('fog'),
    fits: props.playerCount >= t.players[0] && props.playerCount <= t.players[1],
  }
}))
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <button
      v-for="p in previews"
      :key="p.template.id"
      type="button"
      class="flex flex-col gap-2 rounded-xl border p-3 text-left transition-all"
      :class="model === p.template.id
        ? 'border-primary bg-primary/10'
        : 'border-mist-700/40 hover:border-white/30 hover:bg-white/5'"
      @click="model = p.template.id"
    >
      <svg :viewBox="p.viewBox" class="h-24 w-full" aria-hidden="true">
        <polygon
          v-for="(h, i) in p.hexes"
          :key="i"
          :points="h.points"
          :fill="FILL[h.kind][model === p.template.id ? 'on' : 'off']"
          :stroke="h.kind === 'sea' ? 'rgb(127 168 224 / 0.15)' : model === p.template.id ? 'rgb(253 199 0 / 0.7)' : 'rgb(127 168 224 / 0.45)'"
          stroke-width="0.06"
        />
      </svg>
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-semibold text-white">{{ p.template.name }}</span>
        <UBadge
          size="sm"
          :color="p.fits ? 'primary' : 'neutral'"
          variant="subtle"
          icon="i-lucide-users"
          :label="`${p.template.players[0]}–${p.template.players[1]}`"
        />
      </div>
      <span v-if="p.template.scenario" class="text-xs text-primary/80">{{ p.template.scenario }}</span>
      <p class="text-xs text-muted">{{ p.template.description }}</p>
      <p class="text-xs text-dimmed">
        {{ p.land }} Landfelder<template v-if="p.gold"> · {{ p.gold }} Gold</template><template v-if="p.fog"> · {{ p.fog }} Nebel</template>
        · {{ p.template.victoryPoints }} SP
      </p>
    </button>
  </div>
</template>

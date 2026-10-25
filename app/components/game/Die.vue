<script setup lang="ts">
// A die whose pips are faction insignia: Empire die (dark) and Rebel die (light).
const props = withDefaults(defineProps<{
  value: number
  side: Side
  /** Edge length in px. */
  size?: number
}>(), {
  size: 44,
})

// Pip positions in a 3×3 grid (0 = top left, 8 = bottom right).
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

const STYLE = {
  empire: {
    background: 'linear-gradient(145deg, #3a404b 0%, #16191f 55%, #0b0d10 100%)',
    border: '1px solid rgb(255 255 255 / 0.18)',
    pip: '#f87171',
    icon: 'i-fa6-brands-empire',
  },
  rebel: {
    background: 'linear-gradient(145deg, #fffaf0 0%, #ece0c8 55%, #cdbb98 100%)',
    border: '1px solid rgb(0 0 0 / 0.15)',
    pip: '#c2410c',
    icon: 'i-fa6-brands-rebel',
  },
} as const

const s = computed(() => STYLE[props.side])
const pips = computed(() => new Set(PIPS[props.value] ?? []))
</script>

<template>
  <div
    class="grid grid-cols-3 grid-rows-3 place-items-center rounded-[20%] shadow-[inset_0_-4px_8px_rgb(0_0_0/0.35),0_6px_16px_rgb(0_0_0/0.5)]"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      padding: `${size * 0.1}px`,
      background: s.background,
      border: s.border,
    }"
    role="img"
    :aria-label="`${side === 'empire' ? 'Imperium' : 'Rebellen'}-Würfel: ${value}`"
  >
    <div v-for="i in 9" :key="i" class="flex items-center justify-center">
      <UIcon
        v-if="pips.has(i - 1)"
        :name="s.icon"
        :style="{ width: `${size * 0.22}px`, height: `${size * 0.22}px`, color: s.pip }"
      />
    </div>
  </div>
</template>

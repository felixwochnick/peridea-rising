<script setup lang="ts">
// Städte & Ritter event die: 3× Hutten-Armada (barbarian ship), 3 gates in the colors of the
// improvement tracks (Handel / Politik / Wissenschaft).
const props = withDefaults(defineProps<{ value: number, size?: number }>(), { size: 44 })

const face = computed(() => eventFace(props.value))
const look = computed(() => face.value === 'ship'
  ? { bg: 'linear-gradient(145deg, #3b0d0d, #170404)', color: '#ff5a4f', icon: 'i-lucide-skull', label: 'Hutten-Armada rückt vor' }
  : { bg: `linear-gradient(145deg, ${TRACKS[face.value].color}, #111)`, color: '#fff', icon: 'i-lucide-castle', label: TRACKS[face.value].gate })
</script>

<template>
  <div
    class="flex items-center justify-center rounded-[20%] border border-white/25 shadow-[inset_0_-4px_8px_rgb(0_0_0/0.35),0_6px_16px_rgb(0_0_0/0.5)]"
    :style="{ width: `${size}px`, height: `${size}px`, background: look.bg }"
    role="img"
    :aria-label="`Ereigniswürfel: ${look.label}`"
    :title="look.label"
  >
    <UIcon :name="look.icon" :style="{ width: `${size * 0.55}px`, height: `${size * 0.55}px`, color: look.color }" />
  </div>
</template>

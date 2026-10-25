<script setup lang="ts">
const showNumbers = useState('gc-show-numbers', () => false)
const menuOpen = useState('gc-menu', () => false)
const { isFullscreen, toggleFullscreen, trackFullscreen } = useGameFullscreen()
trackFullscreen()
const { compact, touch } = useHudLayout()
// fullscreen is not available on iPhone Safari
const canFullscreen = ref(true)
onMounted(() => { canFullscreen.value = !!document.fullscreenEnabled })

defineShortcuts({
  n: () => { showNumbers.value = !showNumbers.value },
  f: toggleFullscreen,
})
</script>

<template>
  <div class="pointer-events-auto flex shrink-0 gap-1.5 max-sm:flex-col large:gap-2">
    <UTooltip text="Zahlenplättchen ein-/ausblenden">
      <UButton
        icon="i-lucide-hash"
        :size="compact ? 'md' : 'lg'"
        :square="compact"
        :aria-label="compact ? 'Zahlen' : undefined"
        :color="showNumbers ? 'primary' : 'neutral'"
        :variant="showNumbers ? 'solid' : 'outline'"
        class="backdrop-blur-md"
        :class="showNumbers ? '' : 'bg-black/50'"
        @click="showNumbers = !showNumbers"
      >
        <template v-if="!compact">
          Zahlen
          <UKbd v-if="!touch" value="N" size="md" />
        </template>
      </UButton>
    </UTooltip>
    <UTooltip v-if="canFullscreen" :text="isFullscreen ? 'Vollbild verlassen' : 'Vollbild'">
      <UButton
        :icon="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'"
        :size="compact ? 'md' : 'lg'"
        square
        color="neutral"
        variant="outline"
        class="bg-black/50 backdrop-blur-md"
        aria-label="Vollbild"
        @click="toggleFullscreen"
      >
        <UKbd v-if="!compact && !touch" value="F" size="md" />
      </UButton>
    </UTooltip>
    <UTooltip text="Menü">
      <UButton
        icon="i-lucide-menu"
        :size="compact ? 'md' : 'lg'"
        square
        color="neutral"
        variant="outline"
        class="bg-black/50 backdrop-blur-md"
        aria-label="Menü"
        @click="menuOpen = true"
      >
        <UKbd v-if="!compact && !touch" value="Esc" size="md" />
      </UButton>
    </UTooltip>
  </div>
</template>

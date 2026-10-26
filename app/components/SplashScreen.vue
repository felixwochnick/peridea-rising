<script setup lang="ts">
/**
 * First screen when the app starts: what it is made with and where the project lives.
 * Fades in and out by itself; a click or Esc / Space / Enter skips it (the link opens
 * the project in a new tab without skipping).
 */
const emit = defineEmits<{ done: [] }>()

const PROJECT_URL = 'https://github.com/felixwochnick/peridea-rising'
/** Seconds: fade in, hold, fade out */
const TIMING = { in: 0.8, hold: 3.6, out: 0.8 }

const TOOLS = [
  { label: 'TypeScript', icon: 'i-simple-icons-typescript', class: 'text-[#3178c6]' },
  { label: 'Three.js', icon: 'i-simple-icons-threedotjs', class: 'text-white' },
  { label: 'Colyseus', icon: 'i-lucide-radio-tower', class: 'text-[#f2577c]' },
  { label: 'Claude', icon: 'i-simple-icons-claude', class: 'text-[#d97757]' },
]

const leaving = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function finish() {
  if (leaving.value) return
  leaving.value = true
  clearTimeout(timer)
  timer = setTimeout(() => emit('done'), TIMING.out * 1000)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') finish()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  timer = setTimeout(finish, (TIMING.in + TIMING.hold) * 1000)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(timer)
})
</script>

<template>
  <div
    class="splash fixed inset-0 z-50 grid cursor-pointer select-none place-items-center bg-[radial-gradient(ellipse_at_50%_45%,#0b1220,#000_70%)] p-4"
    :class="{ leaving }"
    :style="{ '--in': `${TIMING.in}s`, '--out': `${TIMING.out}s` }"
    @click="finish"
  >
    <div class="content flex flex-col items-center gap-[clamp(10px,2.2vh,24px)] text-center">
      <p class="flex flex-col items-center font-star-jedi text-[clamp(28px,5vw,64px)] leading-none lowercase text-primary drop-shadow-[0_0_24px_var(--ui-primary)]">
        <span>Peridea</span>
        <span class="text-[0.5em] text-muted">Rising</span>
      </p>
      <p class="mt-[clamp(8px,2vh,20px)] text-[clamp(13px,1.2vw,17px)] font-semibold tracking-[0.3em] uppercase text-muted">
        Entwickelt mit
      </p>
      <ul class="flex flex-wrap justify-center gap-[clamp(14px,3vw,40px)]">
        <li v-for="tool in TOOLS" :key="tool.label" class="flex items-center gap-2 text-[clamp(16px,1.8vw,26px)] font-bold text-highlighted">
          <UIcon :name="tool.icon" class="size-[1.3em]" :class="tool.class" />
          {{ tool.label }}
        </li>
      </ul>
      <UButton
        class="mt-[clamp(8px,2vh,20px)]"
        :to="PROJECT_URL"
        target="_blank"
        variant="outline"
        size="lg"
        icon="i-simple-icons-github"
        label="github.com/felixwochnick/peridea-rising"
        @click.stop
      />
      <p class="text-[clamp(11px,0.9vw,13px)] text-muted">
        Inoffizielles Fanprojekt · Star Wars ist eine Marke von Lucasfilm Ltd.
      </p>
    </div>
  </div>
</template>

<style scoped>
/* the backdrop covers the page right away (no flash of what is behind it), only the content fades in */
.content {
  animation: fade-in var(--in) ease-out both;
}
.splash.leaving {
  animation: fade-out var(--out) ease-in both;
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
}
@keyframes fade-out {
  to {
    opacity: 0;
  }
}
</style>

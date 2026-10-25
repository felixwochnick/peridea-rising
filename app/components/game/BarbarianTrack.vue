<script setup lang="ts">
// Städte & Ritter: the Hutten-Armada (Catan barbarians) on its way. Strength = all cities,
// defense = all active fleets. Shown below the player bar.
const { ck, barbarians, structures, players, activeKnightStrength, me } = useGalacticGame()
const { compact } = useHudLayout()

const strength = computed(() => Object.values(structures.value).filter(s => s.kind === 'base').length)
const defense = computed(() => players.value.reduce((a, p) => a + activeKnightStrength(p.id), 0))
const mineDefense = computed(() => activeKnightStrength(me.value.id))
const steps = computed(() => Array.from({ length: BARBARIAN_STEPS }, (_, i) => i + 1))
const danger = computed(() => barbarians.value.step >= BARBARIAN_STEPS - 2)
</script>

<template>
  <div
    v-if="ck"
    class="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-black/60 px-3 py-1 backdrop-blur-md"
    :class="[compact ? 'top-14 text-xs' : 'top-28 text-sm large:top-32', danger ? 'border-error/60' : 'border-white/10']"
  >
    <UTooltip text="Hutten-Armada (Catan: Barbaren) – greift beim 7. Sprung an">
      <UIcon name="i-lucide-skull" class="size-4 text-error" />
    </UTooltip>
    <div class="flex items-center gap-1">
      <span
        v-for="s in steps"
        :key="s"
        class="flex items-center justify-center rounded-full transition-all"
        :class="[
          s === barbarians.step ? 'size-5 bg-error text-black' : s < barbarians.step ? 'size-2.5 bg-error/60' : 'size-2.5 bg-white/20',
          s === BARBARIAN_STEPS ? 'ring-1 ring-error/70' : '',
        ]"
      >
        <UIcon v-if="s === barbarians.step" name="i-lucide-skull" class="size-3.5" />
      </span>
    </div>
    <UTooltip :text="`Angriffsstärke = alle Städte (${strength}) · Abwehr = alle aktiven Flotten (${defense}, davon deine ${mineDefense})`">
      <span class="flex items-center gap-1" :class="defense >= strength ? 'text-success' : 'text-error'">
        <UIcon name="i-lucide-building-2" class="size-3.5" />{{ strength }}
        <span class="text-muted">:</span>
        <UIcon name="i-lucide-shield" class="size-3.5" />{{ defense }}
      </span>
    </UTooltip>
  </div>
</template>

<script setup lang="ts">
const { players, activeIndex, turn, victoryGoal, longestRouteHolder, largestFleetHolder, stats, setup, me, winner } = useGalacticGame()
// Victory point cards stay hidden: you see your own, the others only after the game is won.
const playerStats = computed(() => players.value.map((p) => {
  const st = stats(p)
  const showHidden = p.id === me.value.id || !!winner.value
  return { ...st, shownPoints: showHidden ? st.totalPoints : st.victoryPoints, shownHidden: showHidden ? st.hiddenPoints : 0 }
}))

const KIND_ICON = { human: 'i-lucide-user', bot: 'i-lucide-bot', ai: 'i-lucide-sparkles' } as const
const SIDE_ICON = { rebel: 'i-fa6-brands-rebel', empire: 'i-fa6-brands-empire' } as const

const colorVar = (c: string) => `var(--color-${c}-400)`
// Compact (phone / tablet): small chips. Desktop: full cards.
// Keep a single root element (no top-level comments), so classes from the parent apply.
const { compact } = useHudLayout()
</script>

<template>
  <div v-if="compact" class="pointer-events-none flex min-w-0 items-start gap-1.5">
    <div class="pointer-events-auto hidden shrink-0 flex-col items-center justify-center rounded-lg border border-white/10 bg-black/60 px-2 py-1 backdrop-blur-md sm:flex">
      <span class="text-[10px] uppercase tracking-wider text-muted">{{ setup ? 'Aufbau' : 'Runde' }}</span>
      <span class="font-star-jedi text-base leading-tight text-primary lowercase">{{ setup ? `${setup.step + 1}/${setup.order.length}` : turn }}</span>
    </div>
    <div
      v-for="(p, i) in players"
      :id="`player-card-${p.id}`"
      :key="p.id"
      class="pointer-events-auto relative flex min-w-0 flex-1 basis-0 items-center gap-1.5 rounded-lg border bg-black/60 py-1 pr-2 pl-1 backdrop-blur-md sm:max-w-48"
      :class="i === activeIndex ? 'border-white/50' : 'border-white/10 opacity-85'"
      :style="i === activeIndex ? { boxShadow: `0 0 12px -2px ${colorVar(p.color)}` } : undefined"
    >
      <div class="absolute inset-x-2 top-0 h-0.5 rounded-full" :style="{ background: colorVar(p.color) }" />
      <div
        class="flex size-7 shrink-0 items-center justify-center rounded-full ring-2"
        :style="{ '--tw-ring-color': colorVar(p.color), background: 'rgb(0 0 0 / 0.4)' }"
      >
        <UIcon :name="SIDE_ICON[p.side]" class="size-4" :style="{ color: colorVar(p.color) }" />
      </div>
      <div class="min-w-0 flex-1 leading-tight">
        <div class="hidden truncate text-xs font-semibold text-white sm:block">{{ p.name }}</div>
        <div class="flex items-center gap-1 text-xs text-toned" :class="playerStats[i]!.resourceCards > 7 ? 'text-error' : ''">
          <UIcon name="i-lucide-layers" class="size-3" />{{ playerStats[i]!.resourceCards }}
          <UIcon v-if="longestRouteHolder === p.id" name="i-lucide-route" class="size-3 text-primary" />
          <UIcon v-if="largestFleetHolder === p.id" name="i-lucide-swords" class="size-3 text-primary" />
        </div>
      </div>
      <span class="text-lg font-bold" :style="{ color: colorVar(p.color) }">{{ playerStats[i]!.shownPoints }}</span>
    </div>
  </div>

  <div v-else class="pointer-events-none flex min-w-0 items-start justify-center gap-2 large:gap-3">
    <!-- Turn counter -->
    <div class="pointer-events-auto flex shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-black/50 px-3 py-2 backdrop-blur-md large:px-4">
      <span class="text-xs uppercase tracking-widest text-muted">{{ setup ? 'Aufbau' : 'Runde' }}</span>
      <span class="font-star-jedi text-xl text-primary lowercase large:text-2xl">{{ setup ? `${setup.step + 1}/${setup.order.length}` : turn }}</span>
      <span class="text-xs text-muted">Ziel {{ victoryGoal }} SP</span>
    </div>

    <div
      v-for="(p, i) in players"
      :id="`player-card-${p.id}`"
      :key="p.id"
      class="pointer-events-auto relative min-w-0 max-w-56 flex-1 basis-0 rounded-xl large:max-w-64 border bg-black/50 px-3 py-2 backdrop-blur-md transition-all duration-300"
      :class="i === activeIndex ? 'scale-105 border-white/40' : 'border-white/10 opacity-85'"
      :style="i === activeIndex ? { boxShadow: `0 0 18px -2px ${colorVar(p.color)}` } : undefined"
    >
      <!-- Color strip -->
      <div class="absolute inset-x-3 top-0 h-0.5 rounded-full" :style="{ background: colorVar(p.color) }" />

      <div class="flex items-center gap-2">
        <div
          class="flex size-8 shrink-0 items-center large:size-9 justify-center rounded-full ring-2"
          :style="{ '--tw-ring-color': colorVar(p.color), background: 'rgb(0 0 0 / 0.4)' }"
        >
          <UIcon :name="SIDE_ICON[p.side]" class="size-5" :style="{ color: colorVar(p.color) }" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1">
            <span class="truncate text-sm font-semibold text-white large:text-base">{{ p.name }}</span>
            <UIcon :name="KIND_ICON[p.kind]" class="size-3.5 text-muted" />
          </div>
          <div class="text-xs text-muted large:text-[13px]">
            {{ i === activeIndex ? 'am Zug' : (p.side === 'rebel' ? 'Rebellen' : 'Imperium') }}
          </div>
        </div>
        <!-- Victory points -->
        <UTooltip :text="playerStats[i]!.shownHidden ? `Siegpunkte (davon ${playerStats[i]!.shownHidden} aus verdeckten Siegpunktkarten)` : 'Siegpunkte'">
          <div class="flex flex-col items-center leading-none">
            <span class="text-2xl font-bold large:text-3xl" :style="{ color: colorVar(p.color) }">{{ playerStats[i]!.shownPoints }}</span>
            <span class="text-[11px] uppercase tracking-wider text-muted">SP</span>
          </div>
        </UTooltip>
      </div>

      <!-- Stats -->
      <div class="mt-1.5 flex items-center justify-between text-xs text-toned large:mt-2 large:text-sm">
        <UTooltip text="Rohstoffkarten">
          <span class="flex items-center gap-1" :class="playerStats[i]!.resourceCards > 7 ? 'text-error' : ''">
            <UIcon name="i-lucide-layers" class="size-3.5" />{{ playerStats[i]!.resourceCards }}
          </span>
        </UTooltip>
        <UTooltip text="Aktionskarten">
          <span class="flex items-center gap-1"><UIcon name="i-lucide-scroll-text" class="size-3.5" />{{ playerStats[i]!.actionCards }}</span>
        </UTooltip>
        <UTooltip text="Ausgespielte Flottenkarten">
          <span class="flex items-center gap-1"><UIcon name="i-lucide-swords" class="size-3.5" />{{ p.fleetStrength }}</span>
        </UTooltip>
        <UTooltip text="Längste Hyperraumroute">
          <span class="flex items-center gap-1"><UIcon name="i-lucide-route" class="size-3.5" />{{ playerStats[i]!.routeLength }}</span>
        </UTooltip>
      </div>

      <!-- Bonus cards (2 VP each) -->
      <div v-if="longestRouteHolder === p.id || largestFleetHolder === p.id" class="mt-2 flex gap-1">
        <UBadge v-if="longestRouteHolder === p.id" size="sm" variant="subtle" color="primary" icon="i-lucide-route" label="Längste Route" />
        <UBadge v-if="largestFleetHolder === p.id" size="sm" variant="subtle" color="primary" icon="i-lucide-swords" label="Größte Flotte" />
      </div>
    </div>
  </div>
</template>

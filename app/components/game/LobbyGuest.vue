<script setup lang="ts">
// A guest's view of a multiplayer lobby: the host's settings (read-only), the own seat's side and color.
const mp = useMultiplayer()
const lobby = computed(() => mp.lobby.value!)
const template = computed(() => templateById(lobby.value.config.mapId))
const host = computed(() => lobby.value.seats[0]?.name ?? 'Host')

function setSeat(change: { side?: Side, color?: string }) {
  mp.send('seat', change)
}

const seatLabel = (s: LobbySeat, i: number) =>
  i === lobby.value.you ? 'Du' : s.userId ? s.name : s.type === 'open' ? 'Offener Platz' : SLOT_NAMES[s.type]
</script>

<template>
  <UCard>
    <template #header>
      <div class="text-center space-y-1">
        <p class="text-xs text-muted font-star-jedi tracking-widest lowercase">Lobby {{ lobby.code }}</p>
        <h1 class="text-3xl font-star-jedi text-primary tracking-wide lowercase leading-tight">
          Galactic Colonization
        </h1>
        <p class="flex items-center justify-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Warte auf {{ host }} – der Host startet das Spiel.
        </p>
      </div>
    </template>

    <div class="space-y-6">
      <div class="space-y-3">
        <div
          v-for="(s, i) in lobby.seats"
          :key="i"
          class="flex items-center gap-3 rounded-xl border p-3"
          :class="i === lobby.you ? 'border-primary/50 bg-primary/5' : 'border-mist-700/40'"
        >
          <ColorPicker v-if="i === lobby.you" :model-value="s.color" @update:model-value="color => setSeat({ color })" />
          <span v-else class="size-5 shrink-0 rounded-full" :style="{ backgroundColor: `var(--color-${s.color}-400)` }" />
          <span class="w-36 truncate text-sm font-medium text-white">{{ seatLabel(s, i) }}</span>
          <div v-if="i === lobby.you" class="flex items-center gap-1">
            <UButton color="neutral" :variant="s.side === 'rebel' ? 'solid' : 'outline'" icon="i-fa6-brands-rebel" @click="setSeat({ side: 'rebel' })" />
            <UButton color="neutral" :variant="s.side === 'empire' ? 'solid' : 'outline'" icon="i-fa6-brands-empire" @click="setSeat({ side: 'empire' })" />
          </div>
          <UIcon v-else :name="s.side === 'rebel' ? 'i-fa6-brands-rebel' : 'i-fa6-brands-empire'" class="size-5 text-muted" />
          <span class="flex-1" />
          <span v-if="i === 0" class="text-xs text-primary">Host</span>
          <span v-else-if="s.userId" class="flex items-center gap-1.5 text-xs" :class="s.connected ? 'text-success' : 'text-warning'">
            <span class="size-2 rounded-full" :class="s.connected ? 'bg-success' : 'bg-warning'" />
            {{ s.connected ? 'bereit' : 'getrennt' }}
          </span>
          <span v-else-if="s.type === 'open'" class="text-xs text-muted">frei</span>
          <span v-else class="text-xs text-muted">Bot</span>
        </div>
      </div>

      <USeparator />

      <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted">Karte</dt>
        <dd class="text-white">{{ template.name }}</dd>
        <dt class="text-muted">Siegpunkte</dt>
        <dd class="text-white">{{ lobby.config.victoryPoints }}</dd>
        <dt class="text-muted">Städte &amp; Ritter</dt>
        <dd class="text-white">{{ lobby.config.citiesKnights ? 'ja' : 'nein' }}</dd>
        <dt class="text-muted">Zufälliger Startspieler</dt>
        <dd class="text-white">{{ lobby.config.randomStart ? 'ja' : 'nein' }}</dd>
        <dt class="text-muted">Freundliche Piraten</dt>
        <dd class="text-white">{{ lobby.config.friendlyPirates ? 'ja' : 'nein' }}</dd>
      </dl>
    </div>

    <template #footer>
      <UButton icon="i-lucide-door-open" color="neutral" variant="ghost" label="Lobby verlassen" @click="mp.leave()" />
    </template>
  </UCard>
</template>

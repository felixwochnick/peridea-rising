<script setup lang="ts">
// In-game menu (Esc): continue, save/load, options, shortcuts, leave.
const open = useState('gc-menu', () => false)
const view = ref<'main' | 'options' | 'shortcuts' | 'rolls' | 'leave'>('main')

const { settings, DEFAULTS } = useGameSettings()
const { isFullscreen, toggleFullscreen } = useGameFullscreen()
const { savedAt, refresh, save, load, resetGame } = useGameSave()
const mp = useMultiplayer()
const toast = useToast()

watch(open, (o) => {
  if (o) {
    view.value = 'main'
    refresh()
  }
})

const savedLabel = computed(() => savedAt.value
  ? new Date(savedAt.value).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
  : null)

const TITLES = { main: 'Menü', options: 'Optionen', shortcuts: 'Tastenkürzel', rolls: 'Würfel', leave: 'Spiel verlassen?' } as const

// Main menu buttons: icon pinned to the left edge (all icons in one column), text centered.
const MENU_BTN = { base: 'relative justify-center', leadingIcon: 'absolute left-4' }

// --- roll log / verification ---
const { rollLog } = useGalacticGame()
const rolls = computed(() => [...rollLog.value].reverse())
const rollTab = ref<'stats' | 'log'>('stats')

// Statistics of the game rolls (start rolls excluded): sums 2–12 against the expected
// distribution, single die faces, and rolls per player.
const gameRolls = computed(() => rollLog.value.filter(r => r.turn > 0))
const SUMS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const sumStats = computed(() => {
  const n = gameRolls.value.length
  const counts = SUMS.map(s => gameRolls.value.filter(r => r.values[0] + r.values[1] === s).length)
  const expected = SUMS.map(s => (n * (6 - Math.abs(s - 7))) / 36)
  const top = Math.max(1, ...counts, ...expected)
  return SUMS.map((sum, i) => ({ sum, count: counts[i]!, expected: expected[i]!, height: (counts[i]! / top) * 100, mark: (expected[i]! / top) * 100 }))
})
const faceStats = computed(() => {
  const faces = gameRolls.value.flatMap(r => r.values)
  return [1, 2, 3, 4, 5, 6].map(f => ({ face: f, count: faces.filter(x => x === f).length, share: faces.length ? faces.filter(x => x === f).length / faces.length : 0 }))
})
const playerRollStats = computed(() => {
  const by = new Map<string, { name: string, n: number, sum: number, sevens: number }>()
  for (const r of gameRolls.value) {
    const e = by.get(r.playerId) ?? { name: r.playerName, n: 0, sum: 0, sevens: 0 }
    e.n++
    e.sum += r.values[0] + r.values[1]
    if (r.values[0] + r.values[1] === 7) e.sevens++
    by.set(r.playerId, e)
  }
  return [...by.values()]
})
const sevens = computed(() => sumStats.value.find(s => s.sum === 7)!)
const verified = ref<Record<number, 'ok' | 'bad' | 'busy'>>({})

async function verifyRoll(entry: RollLogEntry) {
  verified.value[entry.index] = 'busy'
  try {
    if (entry.proof.type === 'random-org') {
      const r = await $fetch<{ authentic: boolean }>('/api/random/random-org-verify', {
        method: 'POST',
        body: { random: entry.proof.random, signature: entry.proof.signature },
      })
      verified.value[entry.index] = r.authentic ? 'ok' : 'bad'
    }
    else if (entry.proof.type === 'drand') {
      // re-fetch the public round and re-derive the dice
      const beacon = await $fetch<{ randomness: string }>(entry.proof.url)
      const gameId = useState<string>('gc-game-id').value
      const expected = [...entry.values, ...(entry.event ? [entry.event] : [])]
      const dice = await diceFromSeed(`${beacon.randomness}:${gameId}:${entry.index}`, expected.length)
      verified.value[entry.index] = beacon.randomness === entry.proof.randomness && dice.every((d, i) => d === expected[i]) ? 'ok' : 'bad'
    }
  }
  catch {
    const { [entry.index]: _failed, ...rest } = verified.value
    verified.value = rest
    toast.add({ title: 'Prüfung fehlgeschlagen', description: 'Quelle nicht erreichbar.', color: 'error' })
  }
}

// Esc / outside click: step back to the main view first, then close.
function back() {
  if (view.value !== 'main') view.value = 'main'
  else open.value = false
}

function onSave() {
  try {
    save()
    toast.add({ title: 'Spiel gespeichert', icon: 'i-lucide-save', color: 'success', duration: 2000 })
  }
  catch {
    toast.add({ title: 'Speichern fehlgeschlagen', icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

function onLoad() {
  if (load()) {
    toast.add({ title: 'Spielstand geladen', description: savedLabel.value ?? undefined, icon: 'i-lucide-folder-open', color: 'success', duration: 2000 })
    open.value = false
  }
}

async function leave() {
  open.value = false
  if (mp.active.value) await mp.leave()
  resetGame()
  if (document.fullscreenElement) await document.exitFullscreen()
  await navigateTo('/game-modes/galactic-colonization')
}

const SHORTCUTS = [
  { keys: ['Esc'], label: 'Menü öffnen · Bauen abbrechen' },
  { keys: ['N'], label: 'Zahlenplättchen ein-/ausblenden' },
  { keys: ['H'], label: 'Handeln' },
  { keys: ['K'], label: 'Aktionskarten' },
  { keys: ['F'], label: 'Vollbild' },
  { keys: ['W', 'A', 'S', 'D'], label: 'Kamera verschieben (auch Pfeiltasten)' },
  { keys: ['Mausrad'], label: 'Zoomen' },
  { keys: ['Linke Maustaste'], label: 'Kamera drehen' },
  { keys: ['Rechte Maustaste'], label: 'Kamera verschieben' },
]
const qualityItems = (Object.keys(GRAPHICS) as GraphicsQuality[]).map(value => ({ value, label: GRAPHICS[value].label, description: GRAPHICS[value].description }))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="TITLES[view]"
    :dismissible="false"
    :close="view === 'main'"
    :ui="{ content: 'max-w-md' }"
    @close:prevent="back"
  >
    <template #body>
      <!-- Main -->
      <div v-if="view === 'main'" class="flex flex-col gap-2">
        <UButton size="xl" icon="i-lucide-play" label="Fortsetzen" block :ui="MENU_BTN" @click="open = false" />
        <UButton v-if="!mp.active.value" size="xl" color="neutral" variant="subtle" icon="i-lucide-save" label="Spiel speichern" block :ui="MENU_BTN" @click="onSave" />
        <UButton
          v-if="!mp.active.value"
          size="xl"
          color="neutral"
          variant="subtle"
          icon="i-lucide-folder-open"
          block
          :ui="MENU_BTN"
          :disabled="!savedAt"
          @click="onLoad"
        >
          Spielstand laden
          <span class="absolute right-4 text-xs text-muted">{{ savedLabel ?? 'leer' }}</span>
        </UButton>
        <UButton size="xl" color="neutral" variant="subtle" icon="i-lucide-settings" label="Optionen" block :ui="MENU_BTN" @click="view = 'options'" />
        <UButton size="xl" color="neutral" variant="subtle" icon="i-lucide-keyboard" label="Tastenkürzel" block :ui="MENU_BTN" @click="view = 'shortcuts'" />
        <UButton size="xl" color="neutral" variant="subtle" icon="i-lucide-dices" block :ui="MENU_BTN" @click="view = 'rolls'">
          Würfel
          <span class="absolute right-4 text-xs text-muted">{{ rollLog.length }} Würfe</span>
        </UButton>
        <USeparator class="my-2" />
        <UButton size="xl" color="error" variant="soft" icon="i-lucide-log-out" label="Spiel verlassen" block :ui="MENU_BTN" @click="view = 'leave'" />
        <p v-if="mp.active.value" class="mt-1 text-center text-sm text-muted">
          Multiplayer · Lobby {{ mp.lobby.value?.code }} – das Spiel läuft auf dem Server.
        </p>
        <p v-else class="mt-1 text-center text-sm text-muted">
          Spielstände werden lokal in diesem Browser gespeichert (ein Speicherplatz).
        </p>
      </div>

      <!-- Options -->
      <div v-else-if="view === 'options'" class="flex flex-col gap-5">
        <UFormField label="Grafikqualität" size="lg" description="Weniger Qualität = deutlich weniger Strom und Lüfter.">
          <URadioGroup
            v-model="settings.quality"
            class="mt-2"
            variant="card"
            :items="qualityItems"
            :ui="{ fieldset: 'grid grid-cols-1 gap-2 sm:grid-cols-2' }"
          />
        </UFormField>
        <USwitch v-model="settings.edgeScroll" size="lg" label="Kamera am Bildschirmrand bewegen" description="Wie in Strategiespielen: Maus an den Rand führen." />
        <UFormField :label="`Scrollgeschwindigkeit: ${settings.scrollSpeed.toFixed(1)}×`" size="lg">
          <USlider v-model="settings.scrollSpeed" :min="0.3" :max="2.5" :step="0.1" />
        </UFormField>
        <USwitch v-model="settings.reduceMotion" size="lg" label="Animationen reduzieren" description="Kürzere Würfel- und Rohstoffanimationen." />
        <USwitch v-model="settings.showNumbers" size="lg" label="Zahlenplättchen anzeigen" />
        <USwitch :model-value="isFullscreen" size="lg" label="Vollbild" @update:model-value="toggleFullscreen" />
        <USwitch v-model="settings.mouseTrap" size="lg" label="Maus im Vollbild fangen" description="Der Mauszeiger kann das Spiel nicht verlassen (z. B. auf einen zweiten Bildschirm). Esc gibt ihn frei, ein Klick fängt ihn wieder." />
        <div class="flex justify-between">
          <UButton color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" label="Standard" @click="settings = { ...DEFAULTS }" />
          <UButton icon="i-lucide-arrow-left" label="Zurück" @click="view = 'main'" />
        </div>
      </div>

      <!-- Shortcuts -->
      <div v-else-if="view === 'shortcuts'" class="flex flex-col gap-3">
        <div v-for="s in SHORTCUTS" :key="s.label" class="flex items-center justify-between gap-4">
          <span class="text-base">{{ s.label }}</span>
          <span class="flex shrink-0 gap-1">
            <UKbd v-for="k in s.keys" :key="k" :value="k" size="md" />
          </span>
        </div>
        <UButton class="mt-2 self-end" icon="i-lucide-arrow-left" label="Zurück" @click="view = 'main'" />
      </div>

      <!-- Roll log -->
      <div v-else-if="view === 'rolls'" class="flex flex-col gap-3">
        <div class="flex gap-2">
          <UButton :variant="rollTab === 'stats' ? 'solid' : 'ghost'" color="neutral" icon="i-lucide-chart-column" label="Statistik" @click="rollTab = 'stats'" />
          <UButton :variant="rollTab === 'log' ? 'solid' : 'ghost'" color="neutral" icon="i-lucide-scroll-text" label="Protokoll" @click="rollTab = 'log'" />
        </div>

        <!-- Statistics -->
        <template v-if="rollTab === 'stats'">
          <div v-if="!gameRolls.length" class="py-6 text-center text-muted">Noch keine Spielwürfe.</div>
          <template v-else>
            <div class="flex items-baseline justify-between text-sm text-muted">
              <span>{{ gameRolls.length }} Würfe (ohne Startwurf)</span>
              <span>7er: <b class="text-white">{{ sevens.count }}</b> · erwartet {{ sevens.expected.toFixed(1) }}</span>
            </div>
            <!-- Sums: bars = rolled, line = expected -->
            <div class="flex h-40 items-end gap-1 border-b border-white/15 pb-0.5">
              <UTooltip v-for="s in sumStats" :key="s.sum" :text="`${s.sum}: ${s.count}× gewürfelt, erwartet ${s.expected.toFixed(1)}×`">
                <div class="relative flex h-full flex-1 flex-col justify-end">
                  <span class="mb-0.5 text-center text-xs text-muted">{{ s.count || '' }}</span>
                  <div
                    class="rounded-t transition-all duration-500"
                    :class="s.sum === 7 ? 'bg-error/70' : s.sum === 6 || s.sum === 8 ? 'bg-primary' : 'bg-primary/60'"
                    :style="{ height: `${s.height}%` }"
                  />
                  <div class="absolute inset-x-0 border-t-2 border-dashed border-white/70" :style="{ bottom: `${s.mark}%` }" />
                </div>
              </UTooltip>
            </div>
            <div class="flex gap-1">
              <span v-for="s in sumStats" :key="s.sum" class="flex-1 text-center text-sm font-semibold">{{ s.sum }}</span>
            </div>
            <div class="flex items-center gap-3 text-xs text-muted">
              <span class="flex items-center gap-1"><span class="inline-block h-2.5 w-3 rounded-sm bg-primary/60" /> gewürfelt</span>
              <span class="flex items-center gap-1"><span class="inline-block w-4 border-t-2 border-dashed border-white/70" /> erwartet (Wahrscheinlichkeit)</span>
            </div>

            <!-- Single die faces -->
            <div>
              <div class="mb-1 text-sm text-muted">Einzelne Würfel (erwartet je 16,7 %)</div>
              <div class="grid grid-cols-6 gap-1.5">
                <div v-for="f in faceStats" :key="f.face" class="rounded-lg border border-white/10 py-1 text-center">
                  <div class="text-lg font-bold">{{ f.face }}</div>
                  <div class="text-xs text-muted">{{ f.count }}× · {{ (f.share * 100).toFixed(0) }} %</div>
                </div>
              </div>
            </div>

            <!-- Per player -->
            <div class="space-y-1">
              <div class="text-sm text-muted">Pro Spieler</div>
              <div v-for="p in playerRollStats" :key="p.name" class="flex items-center gap-3 text-sm">
                <span class="flex-1 truncate">{{ p.name }}</span>
                <span class="text-muted">{{ p.n }} Würfe</span>
                <span class="w-20 text-right">Ø {{ (p.sum / p.n).toFixed(1) }}</span>
                <span class="w-14 text-right text-error">{{ p.sevens }}× 7</span>
              </div>
            </div>
          </template>
        </template>

        <!-- Log -->
        <template v-else>
        <p class="text-sm text-muted">
          Quelle einstellen unter <NuxtLink to="/settings" class="text-primary underline" target="_blank">Einstellungen</NuxtLink>.
          drand-Würfe: <code>sha256("randomness:Spiel-ID:Wurf-Nr.")</code>, je ein Byte &lt; 252 → 1 + Byte mod 6.
        </p>
        <div v-if="!rolls.length" class="py-6 text-center text-muted">Noch nicht gewürfelt.</div>
        <div class="max-h-96 space-y-2 overflow-y-auto pr-1">
          <div v-for="r in rolls" :key="r.index" class="rounded-lg border border-white/10 p-2.5">
            <div class="flex items-center gap-3">
              <span class="w-8 text-sm text-muted">#{{ r.index }}</span>
              <span class="flex-1 text-base">
                {{ r.playerName }} <span class="text-muted">· {{ r.turn === 0 ? 'Startwurf' : `Runde ${r.turn}` }}</span>
              </span>
              <span class="font-bold text-primary">{{ r.values[0] }} + {{ r.values[1] }} = {{ r.values[0] + r.values[1] }}</span>
            </div>
            <div class="mt-1.5 flex items-center gap-2 text-sm">
              <UBadge
                size="sm"
                variant="subtle"
                :color="r.fallback ? 'warning' : RANDOM_SOURCES[r.source].verifiable ? 'success' : 'neutral'"
                :icon="RANDOM_SOURCES[r.source].icon"
                :label="r.fallback ? `${RANDOM_SOURCES[r.source].name} ausgefallen → lokal` : RANDOM_SOURCES[r.source].name"
              />
              <a v-if="r.proof.type === 'drand'" :href="r.proof.url" target="_blank" class="text-muted underline">Runde {{ r.proof.round }}</a>
              <span v-if="r.proof.type === 'random-org'" class="text-muted">Serie #{{ r.proof.serialNumber }}</span>
              <span class="flex-1" />
              <template v-if="r.proof.type !== 'local'">
                <UBadge v-if="verified[r.index] === 'ok'" size="sm" color="success" icon="i-lucide-shield-check" label="echt" />
                <UBadge v-else-if="verified[r.index] === 'bad'" size="sm" color="error" icon="i-lucide-shield-x" label="ungültig" />
                <UButton v-else size="xs" color="neutral" variant="outline" icon="i-lucide-search-check" label="Prüfen" :loading="verified[r.index] === 'busy'" @click="verifyRoll(r)" />
              </template>
            </div>
          </div>
        </div>
        </template>
        <UButton class="self-end" icon="i-lucide-arrow-left" label="Zurück" @click="view = 'main'" />
      </div>

      <!-- Leave -->
      <div v-else class="flex flex-col gap-4">
        <p v-if="mp.active.value" class="text-base">
          Ein Bot übernimmt deinen Platz, die anderen spielen weiter. Mit dem Lobby-Code {{ mp.lobby.value?.code }} kannst du zurückkehren.
        </p>
        <p v-else class="text-base">
          Nicht gespeicherter Fortschritt geht verloren.
          <template v-if="savedLabel">Letzter Spielstand: {{ savedLabel }}.</template>
        </p>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Abbrechen" @click="view = 'main'" />
          <UButton v-if="!mp.active.value" color="neutral" variant="subtle" icon="i-lucide-save" label="Speichern & verlassen" @click="onSave(); leave()" />
          <UButton color="error" icon="i-lucide-log-out" label="Verlassen" @click="leave" />
        </div>
      </div>
    </template>
  </UModal>
</template>

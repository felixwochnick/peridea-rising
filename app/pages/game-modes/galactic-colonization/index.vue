<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const playerCount = ref(3)
const victoryPoints = ref(10)
const randomStartPlayer = ref(true)
const friendlyPirates = ref(false)
/** Expansion Städte & Ritter (Catan: Cities & Knights). */
const citiesKnights = ref(false)

/** Multiplayer: the code others join with (= id of the lobby on the server). */
const lobbyCode = ref(generateLobbyCode())
const joinCode = ref('')

async function copyCode() {
  await navigator.clipboard.writeText(lobbyCode.value)
}

const { canMultiplayer, offline, loginWithSso } = useAuth()
const mp = useMultiplayer()
const toast = useToast()

const playerOptions = computed(() => [
  [
    { label: 'Leicht', value: 'bot-easy', icon: 'i-lucide-sun' },
    { label: 'Normal', value: 'bot-normal', icon: 'i-lucide-zap' },
    { label: 'Schwer', value: 'bot-hard', icon: 'i-lucide-skull' },
  ],
  [
    { label: 'Gemini', value: 'ai-gemini', icon: 'i-simple-icons-googlegemini' },
    { label: 'Claude', value: 'ai-claude', icon: 'i-simple-icons-anthropic' },
    { label: 'GPT', value: 'ai-gpt', icon: 'i-simple-icons-openai' },
  ],
  [
    { label: canMultiplayer.value ? 'Mitspieler (offen)' : offline.value ? 'Mitspieler (nur online)' : 'Mitspieler (nur mit SSO)', value: 'open', icon: 'i-lucide-wifi', disabled: !canMultiplayer.value },
  ],
])

function getOption(type: SlotType) {
  return playerOptions.value.flat().find(o => o.value === type)
}

const defaultColors = ['yellow', 'sky', 'rose', 'emerald', 'purple', 'orange']

const slots = ref<LobbySlot[]>(
  Array.from({ length: playerCount.value }, (_, i) => ({
    type: i === 0 ? 'human' : 'bot-normal',
    side: 'rebel',
    color: defaultColors[i] ?? 'yellow',
  })),
)

watch(playerCount, (newCount, oldCount) => {
  if (newCount > oldCount) {
    for (let i = oldCount; i < newCount; i++) {
      slots.value.push({ type: 'bot-normal', side: 'rebel', color: defaultColors[i] ?? 'blue' })
    }
  }
  else {
    slots.value.splice(newCount)
  }
})

// Map template; resources and numbers are randomized on every start.
const mapId = ref(DEFAULT_MAP)
// Seafarers scenarios come with their own victory point goal.
// Städte & Ritter plays 3 points longer (Catan: 13 instead of 10).
const defaultGoal = () => templateById(mapId.value).victoryPoints + (citiesKnights.value ? CK_VICTORY_BONUS : 0)
watch([mapId, citiesKnights], () => { victoryPoints.value = defaultGoal() })
watch(playerCount, (n) => {
  const current = MAP_TEMPLATES.find(t => t.id === mapId.value)
  if (current && n >= current.players[0] && n <= current.players[1]) return
  mapId.value = MAP_TEMPLATES.find(t => n >= t.players[0] && n <= t.players[1])?.id ?? mapId.value
})

const { resetGame } = useGameSave()
const { settings: gameSettings } = useGameSettings()
const { isConnected } = useUserSettings()
const AI_BY_TYPE: Partial<Record<SlotType, AiProvider>> = { 'ai-gemini': 'gemini', 'ai-claude': 'claude', 'ai-gpt': 'openai' }
const unconnectedAi = (type: SlotType) => {
  const provider = AI_BY_TYPE[type]
  return provider && !isConnected(provider) ? provider : null
}

const config = computed<LobbyConfig>(() => ({
  slots: slots.value.map(s => ({ ...s })),
  mapId: mapId.value,
  victoryPoints: victoryPoints.value,
  randomStart: randomStartPlayer.value,
  friendlyPirates: friendlyPirates.value,
  citiesKnights: citiesKnights.value,
}))

// --- multiplayer lobby ----------------------------------------------------------------------
/** Seats for other players: the game is played on the multiplayer server. */
const multiplayer = computed(() => slots.value.some(s => s.type === 'open'))
const inLobby = computed(() => mp.lobby.value?.phase === 'lobby')
const isGuest = computed(() => inLobby.value && !mp.isHost.value)
const seat = (i: number) => (inLobby.value ? mp.lobby.value!.seats[i] : undefined)
const openSeatsLeft = computed(() => (mp.lobby.value?.seats ?? []).filter(s => s.type === 'open' && !s.userId).length)

// the host's changes go to the lobby right away
watch(config, (cfg) => {
  if (inLobby.value && mp.isHost.value) mp.send('config', cfg)
}, { deep: true })
// guests choose their own side and color
watch(() => mp.lobby.value?.seats, (seats) => {
  if (!seats || !mp.isHost.value) return
  seats.forEach((s, i) => {
    const slot = slots.value[i]
    if (i === 0 || !s.userId || !slot) return
    if (slot.side !== s.side) slot.side = s.side
    if (slot.color !== s.color) slot.color = s.color
  })
})

// back into the lobby after a reload
onMounted(() => mp.resume())

// everyone switches to the game when the host starts it
watch(() => mp.lobby.value?.phase, (phase) => {
  if (phase === 'game') navigateTo('/game-modes/galactic-colonization/game')
}, { immediate: true })

const errorText = (e: unknown) => {
  const err = e as { message?: string, statusMessage?: string, data?: { statusMessage?: string } }
  return err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? 'Unbekannter Fehler'
}

async function openLobby() {
  try {
    await mp.create(lobbyCode.value, config.value)
  }
  catch (e) {
    toast.add({ title: 'Lobby konnte nicht geöffnet werden', description: errorText(e), color: 'error', icon: 'i-lucide-wifi-off' })
  }
}

async function joinLobby() {
  if (!LOBBY_CODE.test(joinCode.value.trim().toUpperCase())) {
    toast.add({ title: 'Der Code hat 6 Zeichen (Buchstaben und Ziffern).', color: 'warning', icon: 'i-lucide-circle-alert' })
    return
  }
  try {
    await mp.join(joinCode.value)
  }
  catch (e) {
    toast.add({ title: 'Beitritt fehlgeschlagen', description: errorText(e), color: 'error', icon: 'i-lucide-wifi-off' })
  }
}

function requestFullscreen() {
  // must happen inside the click (browsers only allow fullscreen on a user gesture)
  if (gameSettings.value.fullscreenOnStart && document.fullscreenEnabled && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {})
  }
}

function startGame() {
  requestFullscreen()
  if (inLobby.value) {
    mp.send('start')
    return
  }
  resetGame()
  useGalacticGame().startNewGame(newGameConfig(config.value))
  navigateTo('/game-modes/galactic-colonization/game')
}
</script>

<template>
  <!-- self-start: not vertically centered, so the card doesn't jump while it grows -->
  <div class="w-full max-w-2xl space-y-6 self-start">
    <!-- Guests in a lobby: the host's settings, read-only -->
    <GameLobbyGuest v-if="isGuest" />

    <UCard v-else>
      <template #header>
        <div class="text-center space-y-1">
          <p class="text-xs text-muted font-star-jedi tracking-widest lowercase">{{ inLobby ? 'Lobby' : 'Spielmodus' }}</p>
          <h1 class="text-3xl font-star-jedi text-primary tracking-wide lowercase leading-tight">
            Galactic Colonization
          </h1>
        </div>
      </template>

      <div class="space-y-6">

        <!-- 1. Spieleranzahl -->
        <div class="flex items-center justify-between gap-4">
          <span class="text-sm font-star-jedi tracking-widest text-white lowercase">Spieleranzahl</span>
          <div class="flex items-center gap-3">
            <UButton
              icon="i-lucide-minus"
              color="neutral"
              variant="outline"
              size="xs"
              :disabled="playerCount <= 2 || !!seat(playerCount - 1)?.userId"
              @click="playerCount--"
            />
            <span class="text-primary font-bold w-4 text-center">{{ playerCount }}</span>
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              size="xs"
              :disabled="playerCount >= 6"
              @click="playerCount++"
            />
          </div>
        </div>

        <USeparator />

        <!-- 2. Spieler Slots -->
        <div class="space-y-3">
          <div
            v-for="(slot, index) in slots"
            :key="index"
            class="rounded-xl border border-mist-700/40 p-3"
          >
            <div class="flex items-center gap-3">
              <!-- Color + Name -->
              <div class="flex items-center gap-2 w-28 shrink-0">
                <ColorPicker v-model="slot.color" />
                <span class="truncate text-sm font-medium text-white">
                  {{ index === 0 ? 'Du' : seat(index)?.name ?? `Spieler ${index + 1}` }}
                </span>
              </div>

              <!-- Seite -->
              <div class="flex items-center gap-1">
                <UButton
                  color="neutral"
                  :variant="slot.side === 'rebel' ? 'solid' : 'outline'"
                  icon="i-fa6-brands-rebel"
                  @click="slot.side = 'rebel'"
                />
                <UButton
                  color="neutral"
                  :variant="slot.side === 'empire' ? 'solid' : 'outline'"
                  icon="i-fa6-brands-empire"
                  @click="slot.side = 'empire'"
                />
              </div>

              <!-- Typ -->
              <div class="flex-1">
                <template v-if="index === 0">
                  <span class="text-xs text-muted">Mensch</span>
                </template>
                <template v-else-if="seat(index)?.userId">
                  <span class="flex items-center gap-2 text-xs" :class="seat(index)!.connected ? 'text-success' : 'text-warning'">
                    <span class="size-2 rounded-full" :class="seat(index)!.connected ? 'bg-success' : 'bg-warning'" />
                    {{ seat(index)!.connected ? 'Beigetreten' : 'Verbindung unterbrochen' }}
                  </span>
                </template>
                <template v-else>
                  <USelectMenu
                    v-model="slot.type"
                    :items="playerOptions"
                    value-key="value"
                    size="sm"
                    class="w-full"
                  >
                    <template #leading>
                      <UIcon
                        v-if="getOption(slot.type)"
                        :name="getOption(slot.type)!.icon"
                        class="size-4 text-muted"
                      />
                    </template>
                  </USelectMenu>
                  <p v-if="slot.type === 'open' && inLobby" class="mt-1 flex items-center gap-1 text-xs text-muted">
                    <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
                    Wartet auf einen Mitspieler …
                  </p>
                  <NuxtLink
                    v-if="unconnectedAi(slot.type)"
                    to="/settings"
                    class="mt-1 flex items-center gap-1 text-xs text-warning hover:underline"
                  >
                    <UIcon name="i-lucide-plug" class="size-3.5" />
                    {{ AI_PROVIDERS[unconnectedAi(slot.type)!].name }} ist nicht verbunden – in den Einstellungen verbinden
                  </NuxtLink>
                </template>
              </div>
            </div>
          </div>
        </div>

        <USeparator />

        <!-- 3. Karte -->
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-4">
            <span class="text-sm font-star-jedi tracking-widest text-white lowercase">Karte</span>
            <span class="flex items-center gap-1 text-xs text-muted">
              <UIcon name="i-lucide-shuffle" class="size-3.5" />
              Rohstoffe & Zahlen werden zufällig verteilt
            </span>
          </div>
          <GameMapPicker v-model="mapId" :player-count="playerCount" />
        </div>

        <USeparator />

        <!-- 4. Weitere Einstellungen -->
        <div class="space-y-4">

          <!-- Erweiterung Städte & Ritter -->
          <div class="flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div class="space-y-0.5">
              <p class="flex items-center gap-2 text-sm text-white">
                <UIcon name="i-lucide-castle" class="size-4 text-primary" />
                Erweiterung: Städte &amp; Ritter
              </p>
              <p class="text-xs text-muted">
                Handelswaren (Bacta, Treibstoff, Beskar), Stadtausbau mit Metropolen, Flotten als Ritter
                und die Hutten-Armada. Statt Aktionskarten. Siegziel +3.
              </p>
            </div>
            <USwitch v-model="citiesKnights" />
          </div>

          <!-- Siegpunkte -->
          <div class="flex items-center justify-between gap-4">
            <div class="space-y-0.5">
              <p class="text-sm text-white">Siegpunkte</p>
              <p class="text-xs text-muted">Punkte zum Gewinnen</p>
            </div>
            <div class="flex items-center gap-3">
              <UButton
                icon="i-lucide-minus"
                color="neutral"
                variant="outline"
                size="xs"
                :disabled="victoryPoints <= 5"
                @click="victoryPoints--"
              />
              <span class="text-primary font-bold w-6 text-center">{{ victoryPoints }}</span>
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                size="xs"
                :disabled="victoryPoints >= 20"
                @click="victoryPoints++"
              />
            </div>
          </div>

          <!-- Zufälliger Startspieler -->
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <p class="text-sm text-white">Zufälliger Startspieler</p>
              <p class="text-xs text-muted">Wer beginnt wird zufällig bestimmt</p>
            </div>
            <USwitch v-model="randomStartPlayer" />
          </div>

          <!-- Freundliche Piraten -->
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <p class="text-sm text-white">Freundliche Piraten</p>
              <p class="text-xs text-muted">Die Piraten dürfen keine Planeten eines Spielers blockieren, der nur 2 Siegpunkte hat.</p>
            </div>
            <USwitch v-model="friendlyPirates" />
          </div>

          <!-- Multiplayer: nur mit SSO-Konto -->
          <div v-if="!canMultiplayer" class="flex items-center justify-between gap-4 rounded-lg border border-mist-700/40 p-3">
            <div class="space-y-0.5">
              <p class="flex items-center gap-2 text-sm text-white">
                <UIcon name="i-lucide-users" class="size-4 text-muted" />
                Multiplayer
              </p>
              <p class="text-xs text-muted">
                {{ offline ? 'Du bist offline – solo gegen Bots und KI. Partien mit anderen gehen nur mit Verbindung.' : 'Du spielst anonym (solo). Für Partien mit anderen melde dich per SSO an.' }}
              </p>
            </div>
            <UButton v-if="!offline" icon="i-simple-icons-authentik" color="neutral" variant="outline" size="sm" label="SSO-Anmeldung" @click="loginWithSso" />
          </div>
          <div v-else-if="multiplayer || inLobby" class="flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div class="space-y-0.5">
              <p class="flex items-center gap-2 text-sm text-white">
                <UIcon name="i-lucide-users" class="size-4 text-primary" />
                Lobby-Code
              </p>
              <p class="text-xs text-muted">
                {{ inLobby ? 'Gib ihn deinen Mitspielern – sie treten unter „Lobby beitreten“ bei.' : 'Mit diesem Code treten deine Mitspieler bei, sobald die Lobby offen ist.' }}
              </p>
            </div>
            <div class="flex items-center gap-1">
              <span class="font-mono text-lg tracking-widest text-primary font-bold">{{ lobbyCode }}</span>
              <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="xs" aria-label="Kopieren" @click="copyCode" />
              <UButton
                v-if="!inLobby"
                icon="i-lucide-rotate-cw"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Neu generieren"
                @click="lobbyCode = generateLobbyCode()"
              />
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-2">
          <UButton
            v-if="inLobby"
            icon="i-lucide-door-open"
            color="neutral"
            variant="ghost"
            label="Lobby schließen"
            @click="mp.leave()"
          />
          <UButton
            v-else
            to="/game-modes"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            label="Zurück"
          />
          <UButton
            v-if="multiplayer && !inLobby"
            icon="i-lucide-radio-tower"
            trailing
            label="Lobby öffnen"
            size="lg"
            :loading="mp.status.value === 'connecting'"
            @click="openLobby"
          />
          <UTooltip v-else :text="openSeatsLeft ? `Noch ${openSeatsLeft} offene${openSeatsLeft > 1 ? ' Plätze' : 'r Platz'}` : ''" :disabled="!openSeatsLeft">
            <UButton
              icon="i-lucide-rocket"
              trailing
              label="Spiel starten"
              size="lg"
              :disabled="inLobby && openSeatsLeft > 0"
              @click="startGame"
            />
          </UTooltip>
        </div>
      </template>
    </UCard>

    <!-- Join a lobby -->
    <UCard v-if="canMultiplayer && !mp.active.value">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-0.5">
          <p class="flex items-center gap-2 text-sm text-white">
            <UIcon name="i-lucide-log-in" class="size-4 text-primary" />
            Lobby beitreten
          </p>
          <p class="text-xs text-muted">Mit dem Code, den dir der Host gibt.</p>
        </div>
        <form class="flex items-center gap-2" @submit.prevent="joinLobby">
          <UInput
            v-model="joinCode"
            placeholder="CODE"
            maxlength="6"
            class="w-32"
            :ui="{ base: 'font-mono uppercase tracking-widest text-center' }"
          />
          <UButton type="submit" icon="i-lucide-arrow-right" label="Beitreten" :loading="mp.status.value === 'connecting'" />
        </form>
      </div>
    </UCard>
  </div>
</template>

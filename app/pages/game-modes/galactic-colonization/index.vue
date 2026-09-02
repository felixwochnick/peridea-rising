<script setup lang="ts">
definePageMeta({ layout: 'game', middleware: 'auth' })

type PlayerType = 'human' | 'bot-easy' | 'bot-normal' | 'bot-hard' | 'ai-gemini' | 'ai-claude' | 'ai-gpt' | 'open'
type PlayerSide = 'rebel' | 'empire'

interface PlayerSlot {
  type: PlayerType
  side: PlayerSide
  color: string
}

const playerCount = ref(3)
const victoryPoints = ref(10)
const randomStartPlayer = ref(true)
const friendlyPirates = ref(false)

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
const lobbyPassword = ref(generatePassword())

async function copyPassword() {
  await navigator.clipboard.writeText(lobbyPassword.value)
}

const playerOptions = [
  [
    { label: 'Leicht', value: 'bot-easy', icon: 'i-lucide-sun' },
    { label: 'Normal', value: 'bot-normal', icon: 'i-lucide-zap' },
    { label: 'Schwer', value: 'bot-hard', icon: 'i-lucide-skull' }
  ],
  [
    { label: 'Gemini', value: 'ai-gemini', icon: 'i-simple-icons-googlegemini' },
    { label: 'Claude', value: 'ai-claude', icon: 'i-simple-icons-anthropic' },
    { label: 'GPT', value: 'ai-gpt', icon: 'i-simple-icons-openai' }
  ],
  [
    { label: 'Offen', value: 'open', icon: 'i-lucide-wifi', disabled: true }
  ]
]

function getOption(type: PlayerType) {
  return playerOptions.flatMap(o => o).find(o => o.value === type)
}

const defaultColors = ['yellow', 'sky', 'rose', 'emerald', 'purple', 'orange']

const slots = ref<PlayerSlot[]>(
  Array.from({ length: playerCount.value }, (_, i) => ({
    type: i === 0 ? 'human' : 'bot-normal',
    side: 'rebel',
    color: defaultColors[i] ?? 'yellow'
  }))
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

function startGame() {
  navigateTo({
    path: '/game-modes/galactic-colonization/play',
    query: { config: JSON.stringify(slots.value) }
  })
}
</script>

<template>
  <div class="w-full max-w-2xl space-y-6">
    <UCard>
      <template #header>
        <div class="text-center space-y-1">
          <p class="text-xs text-muted font-star-jedi tracking-widest lowercase">Spielmodus</p>
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
              :disabled="playerCount <= 2"
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
                <span class="text-sm font-medium text-white">
                  {{ index === 0 ? 'Du' : `Spieler ${index + 1}` }}
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
                </template>
              </div>
            </div>
          </div>
        </div>

        <USeparator />

        <!-- 3. Weitere Einstellungen -->
        <div class="space-y-4">

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

          <!-- Lobby-Passwort -->
          <div class="flex items-center justify-between gap-4">
            <div class="space-y-0.5">
              <p class="text-sm text-white">Lobby-Passwort</p>
              <p class="text-xs text-muted">Für den Multiplayer-Beitritt</p>
            </div>
            <div class="flex items-center gap-1">
              <span class="font-mono text-lg tracking-widest text-primary font-bold">{{ lobbyPassword }}</span>
              <UButton
                icon="i-lucide-copy"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Kopieren"
                @click="copyPassword"
              />
              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Neu generieren"
                @click="lobbyPassword = generatePassword()"
              />
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between">
          <UButton
            to="/game-modes"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            label="Zurück"
          />
          <UButton
            icon="i-lucide-rocket"
            trailing
            label="Spiel starten"
            size="lg"
            @click="startGame"
          />
        </div>
      </template>
    </UCard>
  </div>
</template>

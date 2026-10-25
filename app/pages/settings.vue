<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { settings, isConnected } = useUserSettings()
const { settings: gameSettings } = useGameSettings()
const { canMultiplayer } = useAuth()
const toast = useToast()

const errorText = (e: unknown) => {
  const err = e as { statusMessage?: string, message?: string }
  return err?.statusMessage ?? err?.message
}

// --- random source ---------------------------------------------------------
const testingRandom = ref(false)
const randomTest = ref<string | null>(null)

async function testRandomSource() {
  testingRandom.value = true
  randomTest.value = null
  try {
    if (settings.value.randomSource === 'drand') {
      const b = await $fetch<{ round: number, requestedAtRound: number, randomness: string }>('/api/random/drand')
      const dice = await diceFromSeed(`${b.randomness}:test:1`)
      randomTest.value = `Runde ${b.round} (angefragt bei ${b.requestedAtRound}) → Würfel ${dice.join(' + ')}`
    }
    else if (settings.value.randomSource === 'random-org') {
      const r = await $fetch<{ data: number[], serialNumber: number, bitsLeft: number }>('/api/random/random-org', {
        method: 'POST',
        body: { apiKey: settings.value.randomOrgApiKey, n: 2 },
      })
      randomTest.value = `Signierter Wurf #${r.serialNumber} → ${r.data.join(' + ')} · verbleibendes Kontingent: ${r.bitsLeft} Bit`
    }
    else {
      randomTest.value = 'Lokaler Zufall ist immer verfügbar.'
    }
  }
  catch (e: unknown) {
    toast.add({ title: 'Zufallsquelle nicht erreichbar', description: errorText(e), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    testingRandom.value = false
  }
}

// --- AI accounts -------------------------------------------------------------
const testing = ref<AiProvider | null>(null)
const showKey = ref<Record<AiProvider, boolean>>({ gemini: false, claude: false, openai: false })

const PREFERRED_MODEL: Record<AiProvider, RegExp> = {
  claude: /^claude-sonnet/,
  openai: /^gpt-/,
  gemini: /pro/,
}

async function connect(provider: AiProvider) {
  const account = settings.value.ai[provider]
  testing.value = provider
  try {
    const res = await $fetch<{ ok: boolean, models: string[] }>('/api/ai/test', {
      method: 'POST',
      body: { provider, apiKey: account.apiKey.trim() },
    })
    account.apiKey = account.apiKey.trim()
    account.models = res.models
    if (!res.models.includes(account.model)) {
      account.model = res.models.find(m => PREFERRED_MODEL[provider].test(m)) ?? res.models[0] ?? ''
    }
    account.connectedAt = new Date().toISOString()
    toast.add({ title: `${AI_PROVIDERS[provider].name} verbunden`, description: `${res.models.length} Modelle verfügbar`, color: 'success', icon: 'i-lucide-plug-zap' })
  }
  catch (e: unknown) {
    account.connectedAt = null
    toast.add({ title: `${AI_PROVIDERS[provider].name}: Verbindung fehlgeschlagen`, description: errorText(e), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    testing.value = null
  }
}

function disconnect(provider: AiProvider) {
  settings.value.ai[provider] = { apiKey: '', model: '', models: [], connectedAt: null }
}

const providers = Object.keys(AI_PROVIDERS) as AiProvider[]
const sources = Object.keys(RANDOM_SOURCES) as RandomSource[]
</script>

<template>
  <div class="w-full max-w-3xl space-y-6">
    <div class="text-center">
      <p class="text-xs text-muted font-star-jedi tracking-widest lowercase">Pilot</p>
      <h1 class="text-3xl font-star-jedi text-primary tracking-wide lowercase">Einstellungen</h1>
      <p class="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted">
        <UIcon :name="canMultiplayer ? 'i-lucide-cloud' : 'i-lucide-hard-drive'" class="size-4" />
        {{ canMultiplayer
          ? 'Gespeichert in diesem Browser und in deinem Konto – auch offline, Änderungen werden nachgereicht.'
          : 'Gespeichert in diesem Browser. Mit SSO-Anmeldung werden sie auch in deinem Konto gespeichert.' }}
      </p>
    </div>

    <!-- Game -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-gamepad-2" class="size-5 text-primary" />
          <h2 class="text-lg font-semibold">Spiel</h2>
        </div>
      </template>

      <div class="space-y-4">
        <USwitch v-model="gameSettings.fullscreenOnStart" label="Vollbild beim Spielstart" description="Das Spiel startet direkt im Vollbild. Verlassen mit Esc oder F." />
        <USwitch
          v-model="gameSettings.mouseTrap"
          label="Maus im Vollbild fangen"
          description="Der Mauszeiger kann das Spiel nicht verlassen (z. B. auf einen zweiten Bildschirm) – praktisch für das Verschieben der Kamera am Bildschirmrand. Esc gibt ihn frei, ein Klick fängt ihn wieder."
        />
      </div>
    </UCard>

    <!-- Random source -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-dices" class="size-5 text-primary" />
          <h2 class="text-lg font-semibold">Zufallsgenerator für die Würfel</h2>
        </div>
        <p class="mt-1 text-sm text-muted">
          Mit einer externen Quelle kann niemand – auch keine KI – die Würfel manipulieren. Jeder Wurf landet mit Nachweis im Würfelprotokoll (Spielmenü).
        </p>
      </template>

      <div class="space-y-3">
        <button
          v-for="id in sources"
          :key="id"
          type="button"
          class="flex w-full items-start gap-3 rounded-xl border p-3 text-left transition"
          :class="settings.randomSource === id ? 'border-primary bg-primary/10' : 'border-mist-700/40 hover:border-white/30'"
          @click="settings.randomSource = id; randomTest = null"
        >
          <UIcon :name="RANDOM_SOURCES[id].icon" class="mt-0.5 size-5 shrink-0" :class="settings.randomSource === id ? 'text-primary' : 'text-muted'" />
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-white">{{ RANDOM_SOURCES[id].name }}</span>
              <UBadge v-if="RANDOM_SOURCES[id].verifiable" size="sm" color="success" variant="subtle" icon="i-lucide-shield-check" label="nachprüfbar" />
            </div>
            <p class="text-sm text-muted">{{ RANDOM_SOURCES[id].description }}</p>
          </div>
        </button>

        <UFormField
          v-if="settings.randomSource === 'random-org'"
          label="random.org API-Schlüssel"
          description="Kostenlos unter api.random.org/dashboard (Developer-Schlüssel)."
        >
          <UInput v-model="settings.randomOrgApiKey" type="password" placeholder="00000000-0000-0000-0000-000000000000" class="w-full" />
        </UFormField>

        <div class="flex items-center gap-3">
          <UButton
            icon="i-lucide-flask-conical"
            color="neutral"
            variant="outline"
            label="Quelle testen"
            :loading="testingRandom"
            :disabled="settings.randomSource === 'random-org' && !settings.randomOrgApiKey"
            @click="testRandomSource"
          />
          <span v-if="randomTest" class="text-sm text-success">{{ randomTest }}</span>
        </div>
      </div>
    </UCard>

    <!-- AI accounts -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bot" class="size-5 text-primary" />
          <h2 class="text-lg font-semibold">KI-Konten</h2>
        </div>
        <p class="mt-1 text-sm text-muted">
          Verbinde deine Accounts, damit Gemini, Claude und GPT als Gegner antreten können. Abos wie ChatGPT Plus oder Claude Pro
          lassen sich von fremden Apps nicht nutzen – du brauchst einen API-Schlüssel aus der Entwickler-Konsole des Anbieters
          (Nutzung wird dort abgerechnet).
        </p>
      </template>

      <div class="space-y-4">
        <div
          v-for="p in providers"
          :key="p"
          class="rounded-xl border p-4"
          :class="isConnected(p) ? 'border-success/40' : 'border-mist-700/40'"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <UIcon :name="AI_PROVIDERS[p].icon" class="size-5" />
              <span class="font-semibold text-white">{{ AI_PROVIDERS[p].name }}</span>
              <UBadge v-if="isConnected(p)" size="sm" color="success" variant="subtle" icon="i-lucide-check" label="verbunden" />
              <UBadge v-else size="sm" color="neutral" variant="subtle" label="nicht verbunden" />
            </div>
            <UButton
              :to="AI_PROVIDERS[p].keyUrl"
              target="_blank"
              size="xs"
              color="neutral"
              variant="ghost"
              trailing-icon="i-lucide-external-link"
              label="Schlüssel erstellen"
            />
          </div>

          <div class="flex gap-2">
            <UInput
              v-model="settings.ai[p].apiKey"
              :type="showKey[p] ? 'text' : 'password'"
              placeholder="API-Schlüssel"
              class="flex-1"
              @update:model-value="settings.ai[p].connectedAt = null"
            >
              <template #trailing>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="link"
                  :icon="showKey[p] ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="showKey[p] ? 'Schlüssel verbergen' : 'Schlüssel anzeigen'"
                  @click="showKey[p] = !showKey[p]"
                />
              </template>
            </UInput>
            <UButton
              icon="i-lucide-plug-zap"
              label="Verbinden"
              :loading="testing === p"
              :disabled="!settings.ai[p].apiKey"
              @click="connect(p)"
            />
            <UButton
              v-if="settings.ai[p].apiKey"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              aria-label="Verbindung entfernen"
              @click="disconnect(p)"
            />
          </div>

          <UFormField v-if="isConnected(p) && settings.ai[p].models.length" label="Modell für Partien" class="mt-3">
            <USelectMenu v-model="settings.ai[p].model" :items="settings.ai[p].models" class="w-full" />
          </UFormField>
        </div>

        <p class="flex items-start gap-2 text-sm text-muted">
          <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0" />
          Schlüssel werden nur in diesem Browser gespeichert und beim Testen bzw. Spielen direkt an den Anbieter weitergereicht – nicht auf unserem Server abgelegt und nicht mit deinem Konto synchronisiert.
        </p>
      </div>
    </UCard>
  </div>
</template>

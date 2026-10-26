<script setup lang="ts">
// Start screen: play solo, sign in for multiplayer or install the app. The splash follows on /game-modes.
definePageMeta({ layout: 'center' })

const { loggedIn, isAnonymous, offline, loginAnonymously, loginWithSso } = useAuth()
const { $pwa } = useNuxtApp()
const route = useRoute()

const loading = ref<'solo' | 'sso' | null>(null)
const error = ref<string | null>(route.query.error === 'sso' ? 'SSO-Anmeldung abgebrochen oder fehlgeschlagen.' : null)
/** Shows the splash screen once the game is started (see game-modes/index.vue). */
const GAME = { path: '/game-modes', query: { splash: null } }

async function playSolo() {
  loading.value = 'solo'
  error.value = null
  try {
    // a guest or SSO session is simply kept
    if (!loggedIn.value) await loginAnonymously()
    await navigateTo(GAME)
  }
  catch (e) {
    error.value = 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.'
    console.error(e)
  }
  finally {
    loading.value = null
  }
}

async function signIn() {
  loading.value = 'sso'
  error.value = null
  try {
    // Authentik sends the player back to /game-modes?splash
    await loginWithSso()
  }
  catch (e) {
    error.value = 'SSO ist gerade nicht erreichbar.'
    console.error(e)
    loading.value = null
  }
}

const installed = computed(() => !!$pwa?.isPWAInstalled.value)
/** Firefox and Safari have no install event: explain the way through the browser menu instead. */
const installHelp = ref(false)
const platform = ref<'ios' | 'safari' | 'firefox-android' | 'firefox' | 'other'>('other')

onMounted(() => {
  const agent = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(agent) || (/macintosh/i.test(agent) && navigator.maxTouchPoints > 1)) platform.value = 'ios'
  else if (/firefox|fxios/i.test(agent)) platform.value = /android/i.test(agent) ? 'firefox-android' : 'firefox'
  else if (/safari/i.test(agent) && !/chrome|chromium|android/i.test(agent)) platform.value = 'safari'
})

async function install() {
  if ($pwa?.showInstallPrompt.value) await $pwa.install()
  else installHelp.value = true
}
</script>

<template>
  <MatrixBackground color="white" />
  <BrowserNotice />

  <div class="relative z-10 flex w-full max-w-md flex-col items-center gap-10 p-6 text-center">
    <div class="flex flex-col items-center gap-4">
      <h1 class="flex flex-col items-center font-star-jedi text-6xl leading-none lowercase text-primary sm:text-7xl">
        <span>Peridea</span>
        <span>Rising</span>
      </h1>
      <p class="font-star-jedi text-lg lowercase text-muted">
        Galactic Colonization
      </p>
    </div>

    <div class="flex w-full flex-col gap-4">
      <UAlert v-if="error" color="error" :description="error" />
      <UAlert
        v-if="offline"
        color="warning"
        variant="subtle"
        icon="i-lucide-wifi-off"
        description="Keine Verbindung – du kannst solo gegen Bots und KI spielen. SSO und Multiplayer gehen erst wieder online."
      />

      <div class="space-y-1">
        <UButton
          size="xl"
          icon="i-lucide-play"
          :label="loggedIn && !isAnonymous ? 'Spiel starten' : 'Solo spielen'"
          block
          :loading="loading === 'solo'"
          :disabled="!!loading"
          @click="playSolo"
        />
        <p class="text-xs text-muted">
          {{ loggedIn && !isAnonymous ? 'Solo oder im Multiplayer.' : 'Anonym, ohne Konto – gegen Bots und KI.' }}
        </p>
      </div>

      <div v-if="!offline && !(loggedIn && !isAnonymous)" class="space-y-1">
        <UButton
          size="xl"
          color="neutral"
          variant="outline"
          icon="i-simple-icons-authentik"
          label="Anmelden & Multiplayer"
          block
          :loading="loading === 'sso'"
          :disabled="!!loading"
          @click="signIn"
        />
        <p class="text-xs text-muted">
          Mit SSO über Authentik – spiele mit anderen.
        </p>
      </div>

      <div v-if="!installed" class="space-y-1">
        <UButton
          size="xl"
          color="neutral"
          variant="subtle"
          icon="i-lucide-download"
          label="Herunterladen"
          block
          @click="install"
        />
        <p class="text-xs text-muted">
          Als App installiert startet das Spiel im Vollbild und läuft auch offline.
        </p>
      </div>
    </div>
  </div>

  <UModal v-model:open="installHelp" title="Als App installieren">
    <template #body>
      <ol class="list-decimal space-y-2 ps-5">
        <template v-if="platform === 'ios'">
          <li>Tippe unten auf <UIcon name="i-lucide-share" class="align-middle" /> <strong>Teilen</strong>.</li>
          <li>Wähle <strong>Zum Home-Bildschirm</strong>.</li>
        </template>
        <template v-else-if="platform === 'safari'">
          <li>Öffne in der Menüleiste <strong>Ablage</strong>.</li>
          <li>Wähle <strong>Zum Dock hinzufügen …</strong>.</li>
        </template>
        <template v-else-if="platform === 'firefox-android'">
          <li>Öffne das Menü <UIcon name="i-lucide-ellipsis-vertical" class="align-middle" />.</li>
          <li>Wähle <strong>Installieren</strong> bzw. <strong>Zum Startbildschirm hinzufügen</strong>.</li>
        </template>
        <template v-else-if="platform === 'firefox'">
          <li>Firefox kann Web-Apps auf dem Computer nicht installieren.</li>
          <li>Öffne die Seite in Chrome oder Edge und klicke dort auf <strong>Installieren</strong>.</li>
        </template>
        <template v-else>
          <li>Öffne das Browsermenü.</li>
          <li>Wähle <strong>Installieren</strong> bzw. <strong>App installieren</strong>.</li>
        </template>
      </ol>
    </template>
  </UModal>
</template>

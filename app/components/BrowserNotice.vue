<script setup lang="ts">
/**
 * Start page: in browsers without the Keyboard Lock API (Firefox, Safari) Esc always
 * leaves fullscreen, while the game uses Esc for its menu. Recommends Chrome (or another
 * Chromium browser) once; touch devices without a keyboard are not asked.
 */
const DISMISSED_KEY = 'gc-browser-notice-dismissed'

const open = ref(false)
const copied = ref(false)
const browser = ref('diesem Browser')
const windows = ref(false)
const edgeUrl = ref('')

onMounted(() => {
  const keyboardLock = typeof (navigator as Navigator & { keyboard?: { lock?: unknown } }).keyboard?.lock === 'function'
  const touch = window.matchMedia('(pointer: coarse)').matches
  let dismissed = false
  try {
    dismissed = localStorage.getItem(DISMISSED_KEY) === '1'
  }
  catch { // storage blocked: ask again next time
  }
  if (keyboardLock || touch || dismissed) return

  const agent = navigator.userAgent
  if (/firefox|fxios/i.test(agent)) browser.value = 'Firefox'
  else if (/safari/i.test(agent) && !/chrome|chromium|crios|android/i.test(agent)) browser.value = 'Safari'
  windows.value = /windows/i.test(agent)
  // Edge (Chromium) is on every Windows and can be started through its URL scheme
  edgeUrl.value = `microsoft-edge:${location.href}`
  open.value = true
})

/** A web page cannot start another browser, so hand over the link. */
async function openInChrome() {
  try {
    await navigator.clipboard.writeText(location.href)
    copied.value = true
  }
  catch {
    copied.value = false
    prompt('Diesen Link in Chrome öffnen:', location.href)
  }
}

function continueAnyway() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  }
  catch { // storage blocked: ask again next time
  }
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Am besten in Chrome spielen"
    :dismissible="false"
    :close="false"
  >
    <template #body>
      <div class="space-y-3">
        <p>
          In {{ browser }} beendet die <UKbd value="Esc" />-Taste immer den Vollbildmodus –
          das kann eine Webseite dort nicht verhindern. Im Spiel öffnet <UKbd value="Esc" /> aber das Menü
          und bricht Aktionen ab.
        </p>
        <p>
          Chrome und andere Chromium-Browser (Edge, Opera, Brave) geben <UKbd value="Esc" /> im Vollbild an das Spiel
          weiter; den Vollbildmodus verlässt man dort durch langes Drücken von <UKbd value="Esc" /> oder mit <UKbd value="F" />.
        </p>
        <UAlert
          v-if="copied"
          color="primary"
          variant="subtle"
          icon="i-lucide-copy-check"
          title="Link kopiert"
          description="Öffne Chrome und füge ihn in die Adresszeile ein."
          :actions="[{ label: 'Chrome herunterladen', to: 'https://www.google.com/chrome/', target: '_blank', variant: 'link' }]"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center gap-2">
        <UButton icon="i-simple-icons-googlechrome" label="In Chrome öffnen" @click="openInChrome" />
        <UButton v-if="windows" :to="edgeUrl" external color="neutral" variant="subtle" label="In Edge öffnen" />
        <UButton class="ms-auto" color="neutral" variant="ghost" :label="`Trotzdem in ${browser} spielen`" @click="continueAnyway" />
      </div>
    </template>
  </UModal>
</template>

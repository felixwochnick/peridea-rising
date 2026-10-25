<script setup lang="ts">
// New version of the app installed by the service worker: reload when the player wants (not in the middle of a move).
const { $pwa } = useNuxtApp()
const toast = useToast()

watch(() => $pwa?.needRefresh, (needRefresh) => {
  if (!needRefresh) return
  toast.add({
    title: 'Neue Version verfügbar',
    description: 'Neu laden, um sie zu verwenden.',
    icon: 'i-lucide-refresh-cw',
    duration: 0,
    actions: [{ label: 'Neu laden', onClick: () => { $pwa?.updateServiceWorker() } }],
  })
}, { immediate: true })
</script>

<template>
  <span class="hidden" />
</template>

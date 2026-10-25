<script setup lang="ts">
// Shows game notices (steals, discards, start yield …) as toasts.
const { notices } = useGalacticGame()
const toast = useToast()

watch(() => notices.value.length, (len) => {
  if (!len) return
  for (const n of notices.value) {
    toast.add({ title: n.title, description: n.description, icon: n.icon, color: n.color ?? 'neutral', duration: 3500 })
  }
  notices.value = []
}, { immediate: true })
</script>

<template>
  <span class="hidden" />
</template>

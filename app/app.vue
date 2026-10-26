<script setup>
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: '#02040a' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' }
  ],
  htmlAttrs: {
    lang: 'de',
    // the app has only a dark design (Nuxt UI's color mode is off, see nuxt.config)
    class: 'dark',
    style: 'color-scheme: dark'
  }
})

useSeoMeta({
  title: 'Peridea Rising',
  description: 'Galaktisches Aufbau- und Handelsspiel: Planeten besiedeln, Rohstoffe handeln, Hyperraumrouten bauen.'
})
</script>

<template>
  <UApp>
    <NuxtPwaManifest />
    <PwaUpdate />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

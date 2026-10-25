<script setup lang="ts">
const { user, isAnonymous, offline, logout, loginWithSso } = useAuth()

const displayName = computed(() => isAnonymous.value ? 'Pilot (solo)' : user.value?.name || 'Pilot')
const avatarLabel = computed(() => displayName.value.charAt(0).toUpperCase())

async function handleLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <MatrixBackground color="whiteFüp" />

    <!-- Nav Bar -->
    <nav class="relative z-10 flex items-center justify-between px-6 py-4 border-b border-mist-700/40 backdrop-blur-sm bg-black/20">
      <NuxtLink to="/game-modes" class="font-star-jedi tracking-widest lowercase hover:opacity-80 transition-opacity flex items-center gap-4">
          <div class="text-primary text-2xl"> Peridea </div>
          <div class="text-muted text-sm"> Rising </div>
      </NuxtLink>

      <UDropdownMenu
        :items="[
          [
            { label: 'Einstellungen', icon: 'i-lucide-settings', to: '/settings' },
            ...(isAnonymous && !offline ? [{ label: 'Mit SSO anmelden (Multiplayer)', icon: 'i-simple-icons-authentik', onSelect: loginWithSso }] : []),
          ],
          // offline there is no login to go back to
          offline ? [] : [{ label: 'Logout', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: handleLogout }]
        ]"
      >
        <div class="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
          <UBadge v-if="offline" color="warning" variant="subtle" icon="i-lucide-wifi-off" label="Offline" />
          <span class="text-sm text-muted hidden sm:block">{{ displayName }}</span>
          <UAvatar :alt="displayName" :text="avatarLabel" size="sm" />
        </div>
      </UDropdownMenu>
    </nav>

    <!-- Content -->
    <main class="relative z-10 flex-1 flex items-center justify-center p-6">
      <slot />
    </main>
  </div>
</template>

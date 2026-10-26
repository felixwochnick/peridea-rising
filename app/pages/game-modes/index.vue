<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

// Right after starting the game (start page, SSO return): the splash screen, then the modes.
const route = useRoute()
const splash = ref(route.query.splash !== undefined)
function splashDone() {
  splash.value = false
  navigateTo({ query: {} }, { replace: true })
}

const modes = [
    {
        id: 'galactic-colonization',
        title: 'Galactic Colonization',
        description: 'Errobre neue Planeten, handle mit Ressourcen und baue dein galaktisches Imperium auf.',
        icon: 'i-lucide-globe',
        available: true
    }
]
</script>

<template>
    <SplashScreen v-if="splash" @done="splashDone" />
    <UCard class="">
            <template #header>
                <div class="w-full flex flex-col items-center justify-center gap-2">
                    <h1 class="text-4xl font-star-jedi text-primary tracking-widest lowercase">
                        Spielmodus
                    </h1>
                    <p class="text-muted-foreground text-sm font-star-jedi tracking-wide lowercase">
                        Wähle dein Schicksal
                    </p>
                </div>
            </template>

            <template #default>

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl">
                    <button
                        v-for="mode in modes"
                        :key="mode.id"
                        class="group relative flex flex-col items-center gap-5 rounded-2xl border border-mist-700/50 bg-black/30 backdrop-blur-sm p-8 text-center transition-all duration-300 hover:border-primary/60 hover:bg-black/50 hover:scale-105 cursor-pointer"
                        @click="navigateTo(`/game-modes/${mode.id}`)"
                    >
                        <UIcon
                            :name="mode.icon"
                            class="size-14 text-primary transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_12px_theme(colors.yellow.400)]"
                        />
                        <div class="space-y-2">
                            <h2 class="text-lg font-star-jedi text-white tracking-wide leading-tight lowercase">
                                {{ mode.title }}
                            </h2>
                            <p class="text-sm text-muted leading-relaxed">
                                {{ mode.description }}
                            </p>
                        </div>
                    </button>

                    <!-- Placeholder for future modes -->
                    <div
                        class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-mist-700/30 border-dashed bg-black/10 p-8 text-center opacity-40">
                        <UIcon name="i-lucide-plus" class="size-10 text-mist-500"/>
                        <p class="text-sm text-muted font-star-jedi tracking-wide lowercase">
                            Bald verfügbar
                        </p>
                    </div>
                </div>
            </template>

        </UCard>
</template>

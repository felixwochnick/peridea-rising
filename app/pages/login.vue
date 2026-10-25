<script setup lang="ts">
definePageMeta({layout: 'center'})
const {loggedIn, offline, loginAnonymously, loginWithSso} = useAuth()
const route = useRoute()
const loading = ref<'solo' | 'sso' | null>(null)
const error = ref<string | null>(route.query.error === 'sso' ? 'SSO-Anmeldung abgebrochen oder fehlgeschlagen.' : null)

// Redirect if already logged in
if (loggedIn.value) await navigateTo('/game-modes')

async function handleAnonymousLogin() {
    loading.value = 'solo'
    error.value = null
    try {
        await loginAnonymously()
        await navigateTo('/game-modes')
    } catch (e) {
        error.value = 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.'
        console.error(e)
    } finally {
        loading.value = null
    }
}

async function handleSsoLogin() {
    loading.value = 'sso'
    error.value = null
    try {
        await loginWithSso()
    } catch (e) {
        error.value = 'SSO ist gerade nicht erreichbar.'
        console.error(e)
        loading.value = null
    }
}
</script>

<template>
    <MatrixBackground color="white"/>
    <UCard class="w-full max-w-lg">
        <template #header>
            <div class="flex flex-col items-center justify-center gap-4">
                <div class="text-6xl font-bold text-primary font-star-jedi flex flex-col gap-0 items-center lowercase">
                    <div>
                        Peridea
                    </div>
                    <div>
                        Rising
                    </div>
                </div>
                <div class="text-lg text-muted font-star-jedi lowercase">
                    Galactic Colonization
                </div>
            </div>
        </template>

        <div class="space-y-4">
            <UAlert
                v-if="error"
                color="error"
                :description="error"
            />

            <div class="space-y-1">
                <UButton
                    class="w-full justify-center"
                    size="lg"
                    icon="i-lucide-user-round"
                    :loading="loading === 'solo'"
                    :disabled="!!loading"
                    @click="handleAnonymousLogin"
                >
                    Solo spielen
                </UButton>
                <p class="text-center text-xs text-muted">Anonym, ohne Konto – gegen Bots und KI.</p>
            </div>

            <UAlert
                v-if="offline"
                color="warning"
                variant="subtle"
                icon="i-lucide-wifi-off"
                description="Keine Verbindung – du kannst solo gegen Bots und KI spielen. SSO und Multiplayer gehen erst wieder online."
            />

            <USeparator v-if="!offline" label="oder"/>

            <div v-if="!offline" class="space-y-1">
                <UButton
                    class="w-full justify-center"
                    size="lg"
                    color="neutral"
                    variant="outline"
                    icon="i-simple-icons-authentik"
                    :loading="loading === 'sso'"
                    :disabled="!!loading"
                    @click="handleSsoLogin"
                >
                    Mit SSO anmelden
                </UButton>
                <p class="text-center text-xs text-muted">Über Authentik – für den Multiplayer.</p>
            </div>
        </div>
    </UCard>
</template>

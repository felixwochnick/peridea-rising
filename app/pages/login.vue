<script setup lang="ts">
definePageMeta({layout: 'center'})
const {user, init, loginAnonymously} = useAuth()
const loading = ref(false)
const error = ref<string | null>(null)

// Redirect if already logged in
await init()
if (user.value) {
    await navigateTo('/game-modes-modes')
}

async function handleAnonymousLogin() {
    loading.value = true
    error.value = null
    try {
        await loginAnonymously()
        await navigateTo('/game-modes-modes')
    } catch (e) {
        error.value = 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.'
        console.error(e)
    } finally {
        loading.value = false
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
                        Star
                    </div>
                    <div>
                        Sars
                    </div>
                </div>
                <div class="text-lg text-muted font-star-jedi lowercase">
                    Peridea Rising
                </div>
            </div>
        </template>

        <div class="space-y-4">
            <UAlert
                v-if="error"
                color="error"
                :description="error"
            />

            <UButton
                class="w-full justify-center"
                size="lg"
                :loading="loading"
                @click="handleAnonymousLogin"
            >
                Anonym spielen
            </UButton>
        </div>
    </UCard>
</template>

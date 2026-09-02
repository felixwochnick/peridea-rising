<script setup lang="ts">
definePageMeta({layout: 'center'})
const {user, init, loginAnonymously} = useAuth()
const loading = ref(false)
const error = ref<string | null>(null)

// Redirect if already logged in
await init()
if (user.value) {
    await navigateTo('/')
}

async function handleAnonymousLogin() {
    loading.value = true
    error.value = null
    try {
        await loginAnonymously()
        await navigateTo('/')
    } catch (e) {
        error.value = 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.'
        console.error(e)
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <UCard class="w-full max-w-sm">
        <template #header>
            <div class="text-center space-y-2">
                <h1 class="text-2xl font-bold tracking-widest uppercase text-primary font-star-jedi">
                    Star Wars Catan
                </h1>
                <p class="text-sm text-muted">
                    Möge die Macht mit dir sein
                </p>
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

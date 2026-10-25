<script setup lang="ts">
// Gold field / discovered nexus: the human picks the resource(s).
const { goldPicks, chooseGold } = useGalacticGame()
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="translate-y-4 opacity-0"
    leave-active-class="transition duration-200"
    leave-to-class="translate-y-4 opacity-0"
  >
    <div
      v-if="goldPicks > 0"
      class="hud-above-bar pointer-events-auto absolute inset-x-0 mx-auto flex w-fit flex-col items-center gap-3 rounded-xl border border-amber-400/50 bg-black/70 px-3 py-3 sm:px-5 sm:py-4 shadow-[0_0_30px_-6px_rgb(245_197_66/0.6)] backdrop-blur-md"
    >
      <div class="flex items-center gap-2 text-base text-amber-300 sm:text-lg">
        <UIcon name="i-lucide-gem" class="size-5" />
        Handelsnexus: wähle {{ goldPicks }} Rohstoff{{ goldPicks > 1 ? 'e' : '' }}
      </div>
      <div class="flex gap-1 sm:gap-2">
        <UTooltip v-for="id in RESOURCE_ORDER" :key="id" :text="RESOURCES[id].name">
          <button
            type="button"
            class="flex w-14 flex-col items-center rounded-lg border sm:w-20 border-white/10 bg-white/5 p-1 transition hover:-translate-y-1 hover:border-amber-300/70 hover:bg-white/10"
            @click="chooseGold(id)"
          >
            <img :src="`/images/resources/${id}.png`" :alt="RESOURCES[id].name" class="size-9 object-contain sm:size-12">
            <span class="hidden text-sm text-muted sm:block">{{ RESOURCES[id].name }}</span>
          </button>
        </UTooltip>
      </div>
    </div>
  </Transition>
</template>

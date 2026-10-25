<script setup lang="ts">
// Compact card list of a trade offer ("2× Holz, 1× Kyber"); with `check`, missing cards are marked red.
const props = defineProps<{ cards: Partial<Hand>, check?: Hand }>()
const entries = computed(() => CARD_ORDER.filter(r => props.cards[r]).map(r => ({ r, n: props.cards[r]! })))
</script>

<template>
  <div class="flex gap-1.5">
    <UTooltip v-for="{ r, n } in entries" :key="r" :text="`${n}× ${CARD_INFO[r].name}`">
      <span class="relative block size-12">
        <img :src="CARD_INFO[r].image" :alt="CARD_INFO[r].name" class="size-12 object-contain drop-shadow">
        <span
          class="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border bg-black text-xs font-bold"
          :class="check && check[r] < n ? 'border-error/70 text-error' : 'border-white/30 text-white'"
        >{{ n }}</span>
      </span>
    </UTooltip>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const colors = ['rose', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'pink']
</script>

<template>
  <UPopover>
    <button
      class="size-5 rounded-full ring-2 ring-offset-2 ring-offset-black ring-white/20 hover:ring-white/60 transition-all"
      :style="{ backgroundColor: `var(--color-${modelValue}-400)` }"
      :aria-label="`Farbe: ${modelValue}`"
    />

    <template #content>
      <div class="flex gap-2 p-2">
        <button
          v-for="color in colors"
          :key="color"
          class="size-6 rounded-full transition-all duration-150 hover:scale-110 ring-offset-2 ring-offset-black"
          :class="modelValue === color ? 'ring-2 ring-white scale-110' : ''"
          :style="{ backgroundColor: `var(--color-${color}-400)` }"
          :aria-label="color"
          @click="emit('update:modelValue', color)"
        />
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
defineProps<{
  removable?: boolean
  removeLabel?: string
}>()

const emit = defineEmits<{
  remove: []
}>()
</script>

<template>
  <span class="dw-chip">
    <slot name="icon"/>
    <span class="dw-chip__label"><slot/></span>
    <button
        v-if="removable"
        class="dw-chip__remove"
        type="button"
        :aria-label="removeLabel"
        @click="emit('remove')"
    >
      ×
    </button>
  </span>
</template>

<script setup lang="ts">
/** HOST_ONLY — product AI affordance; not part of `@datawise/*`. */
import {DwIcon} from '@/core/icons'

withDefaults(
    defineProps<{
      size?: number
      title?: string
      fit?: boolean
    }>(),
    {
      size: 16,
      fit: false,
    },
)
</script>

<template>
  <DwIcon
      class="ai-icon"
      :class="{ 'ai-icon--fit': fit }"
      name="ai"
      :fit="fit"
      :size="size"
  />
</template>

<style scoped>
.ai-icon {
  display: block;
  flex-shrink: 0;
}

.ai-icon--fit {
  width: 100%;
  height: 100%;
}
</style>

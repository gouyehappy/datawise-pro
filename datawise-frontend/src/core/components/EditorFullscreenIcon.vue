<script setup lang="ts">
/** HOST_ONLY — pairs with EditorFullscreenButton; keep with product editor chrome. */
import {DwIcon} from '@/core/icons'

withDefaults(
    defineProps<{
      active?: boolean
      size?: number
      fit?: boolean
      strokeWidth?: number
    }>(),
    {
      fit: false,
      size: 16,
      strokeWidth: 1.75,
    },
)
</script>

<template>
  <DwIcon
      class="editor-fs-icon"
      name="fullscreen"
      :active="active"
      :fit="fit"
      :size="size"
      :stroke-width="strokeWidth"
  />
</template>

<style scoped>
.editor-fs-icon {
  display: block;
  flex-shrink: 0;
}
</style>

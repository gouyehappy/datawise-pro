<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` DwOverlayScroll. */
import {DwOverlayScroll as PackageDwOverlayScroll} from '@datawise/chrome'

withDefaults(
  defineProps<{
    hideAfterMs?: number
  }>(),
  {hideAfterMs: 900},
)
</script>

<template>
  <PackageDwOverlayScroll :hide-after-ms="hideAfterMs" v-bind="$attrs">
    <slot/>
  </PackageDwOverlayScroll>
</template>

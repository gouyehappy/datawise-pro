<script setup lang="ts">
/** Thin host wrapper ¡ª SoT `@datawise/chrome` DwAutohideScroll (@deprecated alias). */
import {DwAutohideScroll as PackageDwAutohideScroll} from '@datawise/chrome'

withDefaults(
  defineProps<{
    hideAfterMs?: number
  }>(),
  {hideAfterMs: 900},
)
</script>

<template>
  <PackageDwAutohideScroll :hide-after-ms="hideAfterMs" v-bind="$attrs">
    <slot/>
  </PackageDwAutohideScroll>
</template>

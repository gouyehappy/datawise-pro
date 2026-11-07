<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` DwInlineAlert. */
import {DwInlineAlert as PackageDwInlineAlert} from '@datawise/ui'

withDefaults(defineProps<{
  message?: string | null
  variant?: 'error' | 'warning' | 'info' | 'success'
  density?: 'text' | 'banner'
}>(), {
  message: null,
  variant: 'error',
  density: 'text',
})
</script>

<template>
  <PackageDwInlineAlert
      :message="message"
      :variant="variant"
      :density="density"
  >
    <slot/>
  </PackageDwInlineAlert>
</template>

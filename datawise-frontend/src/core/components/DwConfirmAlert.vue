<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` DwConfirmAlert. */
import {DwConfirmAlert as PackageDwConfirmAlert} from '@datawise/ui'

withDefaults(
  defineProps<{
    message: string
    hint?: string | null
    variant?: 'warning' | 'danger'
  }>(),
  {
    hint: null,
    variant: 'warning',
  },
)
</script>

<template>
  <PackageDwConfirmAlert :message="message" :hint="hint" :variant="variant">
    <template v-if="$slots.icon" #icon>
      <slot name="icon"/>
    </template>
    <slot/>
  </PackageDwConfirmAlert>
</template>

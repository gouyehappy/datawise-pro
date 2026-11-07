<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` DwPanelState. */
import {DwPanelState as PackageDwPanelState} from '@datawise/ui'

withDefaults(defineProps<{
  status: 'loading' | 'error' | 'empty'
  message?: string | null
  title?: string | null
  hint?: string | null
  compact?: boolean
  fill?: boolean
}>(), {
  message: null,
  title: null,
  hint: null,
  compact: false,
  fill: false,
})
</script>

<template>
  <PackageDwPanelState
      :status="status"
      :message="message"
      :title="title"
      :hint="hint"
      :compact="compact"
      :fill="fill"
  >
    <template v-if="$slots.loading" #loading>
      <slot name="loading"/>
    </template>
    <template v-if="$slots.error" #error>
      <slot name="error"/>
    </template>
    <template v-if="$slots.empty" #empty>
      <slot name="empty"/>
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions"/>
    </template>
  </PackageDwPanelState>
</template>

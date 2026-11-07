<script setup lang="ts">
/**
 * @deprecated Prefer `DwBrowseToolbar` from `@datawise/chrome` / `@/core/components`.
 * Thin alias kept for existing connector panel imports.
 */
import {DwBrowseToolbar} from '@datawise/chrome'

withDefaults(
    defineProps<{
      query?: string
      queryPlaceholder?: string
      queryAriaLabel?: string
      disabled?: boolean
      statusText?: string
    }>(),
    {
      query: undefined,
      disabled: false,
    },
)

const emit = defineEmits<{
  'update:query': [value: string]
}>()
</script>

<template>
  <DwBrowseToolbar
      class="connector-browse-panel__toolbar"
      :query="query"
      :query-placeholder="queryPlaceholder"
      :query-aria-label="queryAriaLabel"
      :disabled="disabled"
      :status-text="statusText"
      @update:query="emit('update:query', $event)"
  >
    <template v-if="$slots.leading" #leading>
      <slot name="leading"/>
    </template>
    <slot/>
    <template v-if="$slots.actions" #actions>
      <slot name="actions"/>
    </template>
  </DwBrowseToolbar>
</template>

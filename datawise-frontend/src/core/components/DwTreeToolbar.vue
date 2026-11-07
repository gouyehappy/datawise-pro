<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` DwTreeToolbar. */
import {DwTreeToolbar as PackageDwTreeToolbar} from '@datawise/chrome'

withDefaults(
  defineProps<{
    query?: string
    queryPlaceholder?: string
    queryAriaLabel?: string
  }>(),
  {query: undefined},
)

const emit = defineEmits<{
  'update:query': [value: string]
}>()
</script>

<template>
  <PackageDwTreeToolbar
      :query="query"
      :query-placeholder="queryPlaceholder"
      :query-aria-label="queryAriaLabel"
      @update:query="emit('update:query', $event)"
  >
    <template v-if="$slots.actions" #actions>
      <slot name="actions"/>
    </template>
    <slot/>
  </PackageDwTreeToolbar>
</template>

<script setup lang="ts">
import {SearchInput} from '@datawise/ui'

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
  <div class="dw-tree-toolbar">
    <div class="dw-tree-toolbar__actions">
      <slot name="actions"/>
    </div>
    <SearchInput
        v-if="query !== undefined"
        class="dw-tree-toolbar__search"
        size="sm"
        :model-value="query"
        :placeholder="queryPlaceholder"
        :aria-label="queryAriaLabel || queryPlaceholder"
        @update:model-value="emit('update:query', $event)"
    />
    <slot/>
  </div>
</template>

<style scoped>
.dw-tree-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-2) var(--dw-space-3);
  border-bottom: none;
}

.dw-tree-toolbar__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
}

.dw-tree-toolbar__actions :deep(.icon-button),
.dw-tree-toolbar__actions :deep(.dw-icon) {
  /* Align with rail / tree node optical size */
  --dw-tree-toolbar-icon: var(--dw-icon-size-rail, 18px);
}

.dw-tree-toolbar__search {
  flex: 1 1 8rem;
  min-width: 6rem;
}
</style>

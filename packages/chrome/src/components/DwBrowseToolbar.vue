<script setup lang="ts">
import {SearchInput} from '@datawise/ui'

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
  <div class="dw-browse-toolbar">
    <slot name="leading"/>
    <SearchInput
      v-if="query !== undefined"
      class="dw-browse-toolbar__search"
      size="sm"
      :model-value="query"
      :placeholder="queryPlaceholder"
      :aria-label="queryAriaLabel || queryPlaceholder"
      :clearable="true"
      :disabled="disabled"
      @update:model-value="emit('update:query', $event)"
    />
    <slot/>
    <span v-if="statusText" class="dw-browse-toolbar__meta">{{ statusText }}</span>
    <div v-if="$slots.actions" class="dw-browse-toolbar__actions">
      <slot name="actions"/>
    </div>
  </div>
</template>

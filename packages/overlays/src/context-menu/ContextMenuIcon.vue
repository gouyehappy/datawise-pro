<script setup lang="ts">
import type {ContextMenuIcon} from './types'
import {DwIcon} from '@datawise/icons'

defineProps<{
  name?: ContextMenuIcon
  danger?: boolean
  selected?: boolean
}>()
</script>

<template>
  <DwIcon
      v-if="name"
      class="dw-ctx-menu__icon"
      :class="{ 'is-selected': selected }"
      :name="name"
      :danger="danger"
      :filled="name === 'run'"
      size="sm"
      :stroke-width="1.6"
  />
</template>

<style scoped>
:deep(.dw-icon-root) {
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
  color: var(--dw-text-muted);
}

:deep(.dw-icon-root.is-selected) {
  color: var(--dw-primary);
}

:deep(.dw-icon-root.dw-icon--danger) {
  color: var(--dw-danger);
}
</style>

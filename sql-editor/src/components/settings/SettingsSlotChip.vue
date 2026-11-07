<script setup lang="ts">
import {completionSlotToneClass} from '@sql-editor/constants/completion-slots'
import type {SqlCompletionSlot} from '@sql-editor/types'

defineProps<{
  slot: SqlCompletionSlot
  label: string
}>()
</script>

<template>
  <span class="slot-chip" :class="completionSlotToneClass(slot)">{{ label }}</span>
</template>

<style scoped>
.slot-chip {
  display: inline-flex;
  align-items: center;
  max-width: 72px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}
</style>

<style src="@sql-editor/styles/completion-slot-ui.css"></style>

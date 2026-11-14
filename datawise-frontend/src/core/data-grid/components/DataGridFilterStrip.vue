<script setup lang="ts">
/**
 * Clause bar / read-only WHERE·ORDER strip under the DataGrid toolbar (C7).
 */
import {DwIcon} from '@/core/icons'
import GridClauseBar from './GridClauseBar.vue'
import type {ClauseColumnHint} from '@/core/data-grid/services/grid-clause-bar.service'

defineProps<{
  columnFiltersEnabled: boolean
  showFilterBar: boolean
  whereClauseDraft: string
  orderClauseDraft: string
  filterColumnHints: ClauseColumnHint[]
  whereClauseInvalid: boolean
  orderClauseInvalid: boolean
  where?: string
  orderBy?: string
}>()

const emit = defineEmits<{
  'update:whereClauseDraft': [value: string]
  'update:orderClauseDraft': [value: string]
  apply: []
  'focus-change': [focused: boolean]
}>()
</script>

<template>
  <GridClauseBar
      v-if="columnFiltersEnabled"
      :where="whereClauseDraft"
      :order="orderClauseDraft"
      :columns="filterColumnHints"
      :where-invalid="whereClauseInvalid"
      :order-invalid="orderClauseInvalid"
      @update:where="emit('update:whereClauseDraft', $event)"
      @update:order="emit('update:orderClauseDraft', $event)"
      @apply="emit('apply')"
      @focus-change="emit('focus-change', $event)"
  />
  <div v-else-if="showFilterBar" class="filter-bar">
    <div class="filter-left">
      <DwIcon class="filter-icon" name="filter" size="xs" :stroke-width="1.6"/>
      <span class="keyword">WHERE</span>
      <span v-if="where" class="expr">{{ where }}</span>
    </div>
    <div class="filter-right">
      <span class="keyword">ORDER BY</span>
      <DwIcon class="sort-icon" name="arrow-up-down" size="xs" :stroke-width="1.4"/>
      <span v-if="orderBy" class="expr">{{ orderBy }}</span>
    </div>
  </div>
</template>

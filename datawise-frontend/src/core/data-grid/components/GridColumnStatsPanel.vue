<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {GridColumnStats} from '../services/grid-column-stats.service'

/**
 * 列统计浮层（右键表头 → 切换列统计）。
 * 纯展示：统计已由父组件算好，这里只负责渲染与关闭事件。
 */
defineProps<{
  stats: GridColumnStats
}>()

const emit = defineEmits<{
  close: []
}>()

const {t} = useI18n()
</script>

<template>
  <div class="grid-column-stats">
    <div class="grid-column-stats__head">
      <span class="grid-column-stats__title">
        {{ t('dataGrid.columnStatsTitle', {column: stats.columnName}) }}
      </span>
      <span class="grid-column-stats__scope">{{ t('dataGrid.columnStatsScope') }}</span>
      <button class="grid-column-stats__close" type="button" @click="emit('close')">
        {{ t('common.close') }}
      </button>
    </div>
    <div class="grid-column-stats__body">
      <span class="grid-column-stats__pill">
        {{ t('dataGrid.columnStatsRows', {count: stats.rowCount}) }}
      </span>
      <span class="grid-column-stats__pill">
        {{ t('dataGrid.columnStatsNulls', {count: stats.nullCount}) }}
      </span>
      <span class="grid-column-stats__pill">
        {{ t('dataGrid.columnStatsDistinct', {count: stats.distinctCount}) }}
      </span>
      <span
          v-if="stats.numericMin !== undefined && stats.numericMax !== undefined"
          class="grid-column-stats__pill"
      >
        {{ t('dataGrid.columnStatsRange', {
          min: stats.numericMin,
          max: stats.numericMax,
        }) }}
      </span>
      <span v-if="stats.numericAvg !== undefined" class="grid-column-stats__pill">
        {{ t('dataGrid.columnStatsAvg', {value: stats.numericAvg.toFixed(2)}) }}
      </span>
      <span
          v-for="item in stats.topValues"
          :key="`${item.value}:${item.count}`"
          class="grid-column-stats__pill grid-column-stats__pill--muted"
      >
        {{ item.value }} × {{ item.count }}
      </span>
    </div>
  </div>
</template>


<style scoped>
.grid-column-stats {
  flex-shrink: 0;
  padding: var(--dw-pad-control);
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-bg-muted);
}

.grid-column-stats__head {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-3);
}

.grid-column-stats__title {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text);
}

.grid-column-stats__scope {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.grid-column-stats__close {
  margin-left: auto;
  padding: var(--dw-pad-chip);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
}

.grid-column-stats__body {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
}

.grid-column-stats__pill {
  display: inline-flex;
  align-items: center;
  padding: var(--dw-pad-chip);
  border-radius: var(--dw-radius-pill);
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg-panel);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.grid-column-stats__pill--muted {
  font-family: var(--dw-font-mono);
}
</style>

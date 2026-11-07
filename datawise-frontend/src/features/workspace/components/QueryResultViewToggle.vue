<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'

const viewMode = defineModel<'grid' | 'chart'>({required: true})

const {t} = useI18n()
</script>

<template>
  <div
      class="dw-segment dw-segment--sm dw-segment--ghost query-result-view-toggle"
      role="tablist"
      :aria-label="t('queryResult.chart.viewMode')"
  >
    <button
        type="button"
        class="dw-segment__btn dw-segment__btn--label"
        :class="{ 'is-active': viewMode === 'grid' }"
        role="tab"
        :aria-selected="viewMode === 'grid'"
        @click="viewMode = 'grid'"
    >
      <DwIcon class="grid-glyph" name="table" fit :stroke-width="1.75"/>
      <span>{{ t('queryResult.chart.grid') }}</span>
    </button>
    <button
        type="button"
        class="dw-segment__btn dw-segment__btn--label"
        :class="{ 'is-active': viewMode === 'chart' }"
        role="tab"
        :aria-selected="viewMode === 'chart'"
        @click="viewMode = 'chart'"
    >
      <DwIcon class="grid-glyph" name="chart" fit :stroke-width="1.75"/>
      <span>{{ t('queryResult.chart.chart') }}</span>
    </button>
  </div>
</template>

<style scoped>
.query-result-view-toggle {
  height: var(--dw-grid-toolbar-control-h, var(--dw-btn-height-sm));
  min-height: var(--dw-grid-toolbar-control-h, var(--dw-btn-height-sm));
  padding: var(--dw-space-1);
  gap: var(--dw-space-1);
  border: 1px solid color-mix(in srgb, var(--dw-border-light) 85%, transparent);
  border-radius: var(--dw-btn-radius);
  background: color-mix(in srgb, var(--dw-bg) 88%, var(--dw-bg-muted));
}

.query-result-view-toggle :deep(.dw-segment__btn--label) {
  height: 100%;
  gap: var(--dw-gap-xs);
  padding: 0 var(--dw-space-3);
  border-radius: calc(var(--dw-btn-radius) - 1px);
}

.query-result-view-toggle :deep(.grid-glyph.dw-icon-root) {
  width: var(--dw-grid-toolbar-icon-size, var(--dw-icon-size-lg));
  height: var(--dw-grid-toolbar-icon-size, var(--dw-icon-size-lg));
  flex-shrink: 0;
}

.query-result-view-toggle :deep(.dw-icon__glyph) {
  stroke-width: var(--dw-grid-toolbar-icon-stroke, 1.75);
}
</style>

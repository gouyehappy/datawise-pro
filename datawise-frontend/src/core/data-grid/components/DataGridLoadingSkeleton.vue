<script setup lang="ts">
/**
 * Initial-load skeleton for DataGrid body (C7 extract).
 */
import {useI18n} from 'vue-i18n'

withDefaults(
    defineProps<{
      columns?: number[]
      rows?: number
    }>(),
    {
      columns: () => [96, 128, 112, 144, 104, 120],
      rows: 8,
    },
)

const {t} = useI18n()
</script>

<template>
  <div
      class="grid-body-state"
      role="status"
      aria-live="polite"
      :aria-label="t('dataGrid.loadingTitle')"
  >
    <div class="grid-skeleton" aria-hidden="true">
      <div class="grid-skeleton__head">
        <span class="grid-skeleton__cell grid-skeleton__cell--index"/>
        <span
            v-for="(width, colIndex) in columns"
            :key="`h-${colIndex}`"
            class="grid-skeleton__cell grid-skeleton__cell--head"
            :style="{width: `${width}px`}"
        />
      </div>
      <div
          v-for="rowIndex in rows"
          :key="`r-${rowIndex}`"
          class="grid-skeleton__row"
          :style="{'--sk-delay': `${(rowIndex - 1) * 45}ms`}"
      >
        <span class="grid-skeleton__cell grid-skeleton__cell--index"/>
        <span
            v-for="(width, colIndex) in columns"
            :key="`c-${rowIndex}-${colIndex}`"
            class="grid-skeleton__cell"
            :style="{
              width: `${Math.max(48, width - ((rowIndex + colIndex) % 3) * 14)}px`,
            }"
        />
      </div>
    </div>
    <div class="grid-skeleton__status">
      <span class="grid-skeleton__spinner" aria-hidden="true"/>
      <div class="grid-skeleton__copy">
        <strong>{{ t('dataGrid.loadingTitle') }}</strong>
        <span>{{ t('dataGrid.loadingHint') }}</span>
      </div>
    </div>
  </div>
</template>

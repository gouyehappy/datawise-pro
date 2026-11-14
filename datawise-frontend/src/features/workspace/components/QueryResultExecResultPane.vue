<script setup lang="ts">
/**
 * Non-grid DML / exec success summary (C7 extract from QueryResultPane).
 */
import {DwIcon} from '@/core/icons'
import {useI18n} from 'vue-i18n'

defineProps<{
  total: number
  durationMs: number
  sql?: string
  isSlowDuration: (durationMs: number) => boolean
}>()

const {t} = useI18n()
</script>

<template>
  <div class="exec-result-pane">
    <p class="exec-result-pane__title">{{ t('queryResult.execResultTitle') }}</p>
    <p class="exec-result-pane__rows">{{ t('queryResult.dmlAffectedRows', {count: total}) }}</p>
    <p
        class="exec-result-pane__duration"
        :class="{ 'query-duration--slow': isSlowDuration(durationMs) }"
    >
      {{ t('queryResult.messageSuccess', {duration: durationMs}) }}
    </p>
    <details v-if="sql?.trim()" class="exec-result-pane__sql" open>
      <summary class="exec-result-pane__sql-summary">
        <DwIcon class="exec-result-pane__chevron" name="chevron-down" size="sm" :stroke-width="2.25"/>
        <span>{{ t('queryResult.failedSql') }}</span>
      </summary>
      <pre class="exec-result-pane__code">{{ sql }}</pre>
    </details>
  </div>
</template>

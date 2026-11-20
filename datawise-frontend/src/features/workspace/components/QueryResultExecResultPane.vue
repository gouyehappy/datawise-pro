<script setup lang="ts">
/**
 * Non-grid DML / exec success summary (C7 extract from QueryResultPane).
 */
import QueryResultSqlDetails from '@/features/workspace/components/QueryResultSqlDetails.vue'
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
  <div class="result-status-pane">
    <p class="result-status-pane__title">{{ t('queryResult.execResultTitle') }}</p>
    <p class="result-status-pane__lead result-status-pane__lead--ok">
      {{ t('queryResult.dmlAffectedRows', {count: total}) }}
    </p>
    <p
        class="result-status-pane__meta"
        :class="{ 'query-duration--slow': isSlowDuration(durationMs) }"
    >
      {{ t('queryResult.messageSuccess', {duration: durationMs}) }}
    </p>
    <QueryResultSqlDetails :sql="sql"/>
  </div>
</template>

<style scoped>
.result-status-pane {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--dw-space-7) var(--dw-space-8) var(--dw-space-8);
  color: var(--dw-text);
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
}

.result-status-pane__title {
  margin: 0;
  font-size: var(--dw-text-md);
  font-weight: 700;
}

.result-status-pane__lead {
  margin: 0;
  font-size: var(--dw-text-lg);
  font-weight: 600;
}

.result-status-pane__lead--ok {
  color: var(--dw-primary);
}

.result-status-pane__meta {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}
</style>

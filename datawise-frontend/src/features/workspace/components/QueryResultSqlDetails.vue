<script setup lang="ts">
/**
 * Shared collapsible executed-SQL block for success / error result panes.
 */
import {useI18n} from 'vue-i18n'

defineProps<{
  sql?: string
}>()

const {t} = useI18n()
</script>

<template>
  <details v-if="sql?.trim()" class="result-sql" open>
    <summary class="result-sql__summary">
      <span>{{ t('queryResult.failedSql') }}</span>
    </summary>
    <pre class="result-sql__code">{{ sql }}</pre>
  </details>
</template>

<style scoped>
.result-sql {
  margin-top: var(--dw-space-2);
}

.result-sql__summary {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  user-select: none;
  list-style: none;
}

.result-sql__summary::-webkit-details-marker {
  display: none;
}

.result-sql__summary::marker {
  content: none;
}

.result-sql__code {
  margin: var(--dw-space-3) 0 0;
  padding: var(--dw-pad-tight);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-subtle);
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-loose);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dw-text);
}
</style>

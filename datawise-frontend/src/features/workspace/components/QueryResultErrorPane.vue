<script setup lang="ts">
/**
 * SQL error summary + failed SQL details (aligned with exec success pane).
 */
import {DwIcon} from '@/core/icons'
import QueryResultSqlDetails from '@/features/workspace/components/QueryResultSqlDetails.vue'
import {useI18n} from 'vue-i18n'

defineProps<{
  errorMessage?: string
  errorLine?: number
  sql?: string
  enableAiFix?: boolean
  aiFixLoading?: boolean
}>()

const emit = defineEmits<{
  'request-ai-fix': []
  'jump-error-line': [line: number]
}>()

const {t} = useI18n()
</script>

<template>
  <div class="result-status-pane">
    <p class="result-status-pane__title result-status-pane__title--danger">
      {{ t('queryResult.errorTitle') }}
    </p>
    <pre v-if="errorMessage" class="result-status-pane__message">{{ errorMessage }}</pre>
    <div
        v-if="(enableAiFix && sql?.trim() && errorMessage) || errorLine"
        class="result-status-pane__actions"
    >
      <button
          v-if="enableAiFix && sql?.trim() && errorMessage"
          type="button"
          class="result-status-pane__ai"
          :disabled="aiFixLoading"
          @click="emit('request-ai-fix')"
      >
        <DwIcon name="ai" size="xs" :stroke-width="1.5"/>
        <span>{{ aiFixLoading ? t('queryResult.aiFixLoading') : t('queryResult.aiFix') }}</span>
      </button>
      <button
          v-if="errorLine"
          type="button"
          class="result-status-pane__jump"
          @click="emit('jump-error-line', errorLine)"
      >
        {{ t('queryResult.jumpToLine', {line: errorLine}) }}
      </button>
    </div>
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

.result-status-pane__title--danger {
  color: var(--dw-danger);
}

.result-status-pane__message {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-loose);
  color: var(--dw-text);
}

.result-status-pane__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
}

.result-status-pane__ai {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-3) var(--dw-space-6);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 24%, var(--dw-border));
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-primary-softer);
  color: var(--dw-text);
  cursor: pointer;
  font-size: var(--dw-text-sm);
  font-weight: 600;
  transition: var(--dw-transition-colors);
}

.result-status-pane__ai:hover:not(:disabled) {
  background: var(--dw-primary-soft);
  border-color: var(--dw-primary-ring);
  color: var(--dw-primary);
}

.result-status-pane__ai:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.result-status-pane__jump {
  padding: var(--dw-space-3) var(--dw-space-5);
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
  font-size: var(--dw-text-sm);
  transition: background var(--dw-duration-fast) var(--dw-ease), color var(--dw-duration-fast) var(--dw-ease);
}

.result-status-pane__jump:hover {
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  color: var(--dw-text);
}
</style>

<script setup lang="ts">
/**
 * SQL error callout + failed SQL details (C7 extract from QueryResultPane).
 */
import {DwIcon} from '@/core/icons'
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
  <div class="error-pane">
    <div class="error-callout" role="alert">
      <div class="error-callout__icon" aria-hidden="true">
        <DwIcon name="alert-circle" size="md" :stroke-width="1.8"/>
      </div>
      <div class="error-callout__body">
        <p class="error-callout__title">{{ t('queryResult.errorTitle') }}</p>
        <pre class="error-callout__message">{{ errorMessage }}</pre>
        <div
            v-if="(enableAiFix && sql?.trim() && errorMessage) || errorLine"
            class="error-callout__actions"
        >
          <button
              v-if="enableAiFix && sql?.trim() && errorMessage"
              type="button"
              class="error-ai-fix"
              :disabled="aiFixLoading"
              @click="emit('request-ai-fix')"
          >
            <DwIcon name="ai" size="xs" :stroke-width="1.5"/>
            <span>{{ aiFixLoading ? t('queryResult.aiFixLoading') : t('queryResult.aiFix') }}</span>
          </button>
          <button
              v-if="errorLine"
              type="button"
              class="error-jump"
              @click="emit('jump-error-line', errorLine)"
          >
            {{ t('queryResult.jumpToLine', {line: errorLine}) }}
          </button>
        </div>
      </div>
    </div>
    <details v-if="sql?.trim()" class="error-sql" open>
      <summary class="error-sql__summary">
        <DwIcon class="error-sql__chevron" name="chevron-down" size="sm" :stroke-width="2.25"/>
        <span>{{ t('queryResult.failedSql') }}</span>
      </summary>
      <pre class="error-sql__code">{{ sql }}</pre>
    </details>
  </div>
</template>

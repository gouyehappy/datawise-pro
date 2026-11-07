<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {DwButton, DwCodeViewer} from '@/core/components'

const props = withDefaults(
    defineProps<{
      sql: string
      busy?: boolean
      /** Narrow assistant drawer density */
      compact?: boolean
    }>(),
    {compact: false},
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const {t} = useI18n()
</script>

<template>
  <div class="sql-confirm" :class="{ 'sql-confirm--compact': compact }">
    <header class="sql-confirm__header">
      <div class="sql-confirm__heading">
        <span class="sql-confirm__badge" aria-hidden="true">
          <span class="sql-confirm__badge-dot"/>
          {{ t('ai.analysis.sqlConfirmBadge') }}
        </span>
        <h3 class="sql-confirm__title">{{ t('ai.analysis.sqlConfirmTitle') }}</h3>
        <p class="sql-confirm__hint">{{ t('ai.analysis.sqlConfirmHint') }}</p>
      </div>
    </header>

    <DwCodeViewer
        class="sql-confirm__viewer"
        :content="sql"
        language="sql"
        :title="t('ai.analysis.sqlLabel')"
        :subtitle="t('ai.analysis.sqlConfirmReadonly')"
        dark
        readonly
    />

    <footer class="sql-confirm__actions">
      <DwButton
          variant="primary"
          type="button"
          :disabled="busy"
          @click="emit('confirm')"
      >
        {{ busy ? t('ai.analysis.sqlConfirmRunning') : t('ai.analysis.sqlConfirmRun') }}
      </DwButton>
      <DwButton
          variant="ghost"
          type="button"
          :disabled="busy"
          @click="emit('cancel')"
      >
        {{ t('ai.analysis.sqlConfirmCancel') }}
      </DwButton>
    </footer>
  </div>
</template>

<style scoped>
.sql-confirm {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-7);
  min-width: min(480px, 100%);
}

.sql-confirm--compact {
  gap: var(--dw-space-4);
  min-width: 0;
  padding: var(--dw-space-4);
  background: color-mix(in srgb, var(--dw-bg) 55%, var(--dw-bg-panel));
  border-top: 1px solid color-mix(in srgb, var(--dw-border) 70%, transparent);
}

.sql-confirm--compact .sql-confirm__title {
  font-size: var(--dw-text-md);
}

.sql-confirm--compact .sql-confirm__hint {
  font-size: var(--dw-text-xs);
  line-height: 1.45;
}

.sql-confirm--compact .sql-confirm__viewer {
  height: 160px;
  min-height: 160px;
  max-height: 180px;
  box-shadow: none;
}

.sql-confirm--compact .sql-confirm__actions {
  padding-top: var(--dw-space-2);
  margin-top: 0;
}

.sql-confirm__header {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-space-6);
}

.sql-confirm__heading {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.sql-confirm__badge {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-3);
  align-self: flex-start;
  padding: var(--dw-space-2) var(--dw-space-6) var(--dw-space-2) 9px;
  border-radius: var(--dw-radius-pill);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 32%, var(--dw-border-light));
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 700;
  letter-spacing: 0.03em;
  box-shadow: none;
}

.sql-confirm__badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dw-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dw-primary) 22%, transparent);
}

.sql-confirm__title {
  margin: 0;
  font-size: var(--dw-text-xl);
  font-weight: 600;
  line-height: var(--dw-leading-snug);
  color: var(--dw-text);
  letter-spacing: -0.01em;
}

.sql-confirm__hint {
  margin: 0;
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-loose);
  color: var(--dw-text-muted);
}

.sql-confirm__viewer {
  height: 240px;
  min-height: 240px;
  max-height: min(42vh, 320px);
  border-radius: var(--dw-panel-radius);
  overflow: hidden;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--dw-text) 28%, transparent);
}

.sql-confirm__viewer :deep(.dw-code-viewer__body),
.sql-confirm__viewer :deep(.monaco-host) {
  min-height: 0;
  height: 100%;
}

.sql-confirm__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--dw-gap-md);
  padding-top: var(--dw-space-3);
  margin-top: var(--dw-space-2);
  border-top: 1px solid var(--dw-border-light);
}
</style>

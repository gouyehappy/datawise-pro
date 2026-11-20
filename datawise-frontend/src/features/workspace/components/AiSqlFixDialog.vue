<script setup lang="ts">
import {AppModal, ModalActions} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {useI18n} from 'vue-i18n'

defineProps<{
  open: boolean
  originalSql: string
  suggestedSql: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  apply: []
}>()

const {t} = useI18n()

function close() {
  emit('update:open', false)
}

function apply() {
  emit('apply')
  close()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('queryResult.aiFixTitle')"
      width="1040px"
      @close="close"
  >
    <div class="dw-ai-fix">
      <!-- 顶部说明条：强调「追加而非覆盖」 -->
      <div class="dw-ai-fix__notice">
        <span class="dw-ai-fix__notice-icon"><DwIcon name="ai" size="sm" :stroke-width="1.7"/></span>
        <p class="dw-ai-fix__notice-text">{{ t('queryResult.aiFixSubtitle') }}</p>
      </div>

      <!-- 原 SQL → 建议 SQL 对比 -->
      <div class="dw-ai-fix__compare">
        <section class="dw-ai-fix__pane dw-ai-fix__pane--original">
          <header class="dw-ai-fix__pane-head">
            <span class="dw-ai-fix__pane-icon dw-ai-fix__pane-icon--original">
              <DwIcon name="alert-circle" size="xs" :stroke-width="1.8"/>
            </span>
            <h3 class="dw-ai-fix__pane-title">{{ t('queryResult.aiFixOriginal') }}</h3>
          </header>
          <pre class="dw-ai-fix__code dw-ai-fix__code--original"><code>{{ originalSql }}</code></pre>
        </section>

        <div class="dw-ai-fix__arrow" aria-hidden="true">
          <span class="dw-ai-fix__arrow-line"></span>
          <span class="dw-ai-fix__arrow-head"></span>
        </div>

        <section class="dw-ai-fix__pane dw-ai-fix__pane--suggested">
          <header class="dw-ai-fix__pane-head">
            <span class="dw-ai-fix__pane-icon dw-ai-fix__pane-icon--suggested">
              <DwIcon name="check-circle" size="xs" :stroke-width="1.8"/>
            </span>
            <h3 class="dw-ai-fix__pane-title">{{ t('queryResult.aiFixSuggested') }}</h3>
          </header>
          <pre class="dw-ai-fix__code dw-ai-fix__code--suggested"><code>{{ suggestedSql }}</code></pre>
        </section>
      </div>
    </div>

    <template #footer>
      <ModalActions
          :confirm-label="t('queryResult.aiFixApply')"
          :cancel-label="t('common.cancel')"
          :confirm-disabled="loading || !suggestedSql.trim()"
          @cancel="close"
          @confirm="apply"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.dw-ai-fix {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-6);
}

/* 说明条 */
.dw-ai-fix__notice {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-space-3);
  padding: var(--dw-space-4) var(--dw-space-5);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 28%, var(--dw-border-light));
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-primary) 6%, var(--dw-bg-muted));
}

.dw-ai-fix__notice-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
}

.dw-ai-fix__notice-text {
  margin: 0;
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  color: var(--dw-text-secondary);
}

/* 对比区 */
.dw-ai-fix__compare {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr);
  align-items: center;
  gap: var(--dw-space-2);
}

.dw-ai-fix__pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.dw-ai-fix__pane-head {
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  margin-bottom: var(--dw-space-3);
  padding: 0 var(--dw-space-1);
}

.dw-ai-fix__pane-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
}

.dw-ai-fix__pane-icon--original {
  color: var(--dw-danger-fg);
  background: var(--dw-danger-soft);
}

.dw-ai-fix__pane-icon--suggested {
  color: var(--dw-success-fg);
  background: var(--dw-success-soft);
}

.dw-ai-fix__pane-title {
  margin: 0;
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

/* 代码块 */
.dw-ai-fix__code {
  flex: 1;
  min-height: 210px;
  max-height: min(46vh, 400px);
  margin: 0;
  padding: var(--dw-pad-control-lg) var(--dw-space-5);
  overflow: auto;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-muted);
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  white-space: pre-wrap;
  word-break: break-word;
  tab-size: 2;
}

.dw-ai-fix__code--original {
  color: var(--dw-text-secondary);
}

.dw-ai-fix__code--suggested {
  border-color: color-mix(in srgb, var(--dw-success) 42%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-success) 5%, var(--dw-bg-muted));
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--dw-success) 60%, transparent);
}

/* 中间箭头 */
.dw-ai-fix__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--dw-primary);
}

.dw-ai-fix__arrow-line {
  width: 20px;
  height: 1.5px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.6;
}

.dw-ai-fix__arrow-head {
  width: 7px;
  height: 7px;
  border-top: 1.5px solid currentColor;
  border-right: 1.5px solid currentColor;
  transform: rotate(45deg);
  opacity: 0.6;
  margin-left: -3px;
}

@media (max-width: 720px) {
  .dw-ai-fix__compare {
    grid-template-columns: 1fr;
    gap: var(--dw-space-4);
  }

  .dw-ai-fix__arrow {
    transform: rotate(90deg);
    height: 28px;
  }

  .dw-ai-fix__code {
    min-height: 150px;
  }
}
</style>

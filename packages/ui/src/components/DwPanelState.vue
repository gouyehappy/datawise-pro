<!-- Package copy: @datawise/ui DwPanelState. Host file kept until cutover. -->
<script setup lang="ts">
import {computed} from 'vue'
import EmptyState from './EmptyState.vue'

const props = withDefaults(defineProps<{
  /** loading | error | empty；content 时不渲染外壳（由调用方展示主体） */
  status: 'loading' | 'error' | 'empty'
  /** loading 文案，或 error 主文案 / empty 标题 */
  message?: string | null
  /** error 标题（有则 message 降为 detail） */
  title?: string | null
  /** empty 副文案，或 error 补充说明 */
  hint?: string | null
  compact?: boolean
  /** 占满父级可用高度（图/详情面板） */
  fill?: boolean
}>(), {
  message: null,
  title: null,
  hint: null,
  compact: false,
  fill: false,
})

const role = computed(() => {
  if (props.status === 'error') return 'alert'
  if (props.status === 'loading') return 'status'
  return undefined
})

const errorTitle = computed(() => props.title?.trim() || null)
const errorDetail = computed(() => {
  if (errorTitle.value) return props.message?.trim() || props.hint?.trim() || null
  return null
})
const errorPlain = computed(() => {
  if (errorTitle.value) return null
  return props.message?.trim() || null
})
</script>

<template>
  <div
      class="dw-panel-state"
      :class="{
        'dw-panel-state--error': status === 'error',
        'dw-panel-state--compact': compact,
        'dw-panel-state--fill': fill,
      }"
      :role="role"
      :aria-live="status === 'loading' ? 'polite' : undefined"
  >
    <template v-if="status === 'loading'">
      <span class="dw-panel-state__spinner" aria-hidden="true"/>
      <span v-if="message?.trim()">{{ message }}</span>
      <slot name="loading"/>
    </template>

    <template v-else-if="status === 'error'">
      <div v-if="errorTitle" class="dw-panel-state__error-block">
        <div class="dw-panel-state__error-title">{{ errorTitle }}</div>
        <div v-if="errorDetail" class="dw-panel-state__error-detail">{{ errorDetail }}</div>
      </div>
      <template v-else>
        {{ errorPlain }}
      </template>
      <div v-if="$slots.actions" class="dw-panel-state__actions">
        <slot name="actions"/>
      </div>
      <slot name="error"/>
    </template>

    <template v-else>
      <slot name="empty">
        <EmptyState
            embedded
            :compact="compact"
            :title="message?.trim() || ''"
            :hint="hint ?? undefined"
        />
      </slot>
    </template>
  </div>
</template>

<style scoped>
.dw-panel-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--dw-gap-md);
  min-height: 160px;
  padding: var(--dw-space-10);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-md);
  text-align: center;
}

.dw-panel-state--compact {
  min-height: 120px;
  padding: var(--dw-space-8) var(--dw-space-6);
}

.dw-panel-state--fill {
  flex: 1;
  min-height: 220px;
}

.dw-panel-state--error {
  color: var(--dw-danger);
}

.dw-panel-state__spinner {
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  border: 2px solid color-mix(in srgb, var(--dw-primary) 20%, transparent);
  border-top-color: var(--dw-primary);
  border-radius: 50%;
  animation: dw-panel-state-spin 0.75s linear infinite;
}

.dw-panel-state__error-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dw-gap-md);
  max-width: 760px;
}

.dw-panel-state__error-title {
  font-weight: 600;
  color: var(--dw-danger-fg);
}

.dw-panel-state__error-detail {
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  white-space: pre-wrap;
  word-break: break-word;
}

.dw-panel-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap);
  justify-content: center;
}

@keyframes dw-panel-state-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

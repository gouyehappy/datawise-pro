<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import {DwIcon} from '@/core/icons'
import {isUnsavedConnectionId} from '@/features/connection/utils/connection-defaults'
import {useConsoleTransaction} from '@/features/workspace/composables/useConsoleTransaction'
import {isManualTransactionMode} from '@/features/workspace/services/transaction-mode.service'

const props = defineProps<{
  tabId: string
  connectionId?: string
  database?: string
  canManage?: boolean
}>()

const {t} = useI18n()
const rootRef = ref<HTMLElement>()
const open = ref(false)

const transaction = useConsoleTransaction({
  sessionKey: () => props.tabId,
  connectionId: () => props.connectionId,
  database: () => props.database,
})

const isManual = computed(() => isManualTransactionMode(transaction.status.value))
const isPending = computed(() => isManual.value && transaction.status.value.pending)

const statusLabel = computed(() => {
  if (!props.connectionId) return t('console.transaction.noConnection')
  if (isPending.value) return t('console.transaction.manualPending')
  if (isManual.value) return t('console.transaction.manualIdle')
  return t('console.transaction.autocommitOnLabel')
})

const compactStatusLabel = computed(() => {
  if (!props.connectionId) return '—'
  if (isPending.value) return t('console.transaction.compactPending')
  if (isManual.value) return t('console.transaction.compactManual')
  return t('console.transaction.compactAutocommit')
})

const statusTone = computed<'idle' | 'manual' | 'pending' | 'disabled'>(() => {
  if (!props.connectionId) return 'disabled'
  if (props.canManage === false) return 'disabled'
  if (isPending.value) return 'pending'
  if (isManual.value) return 'manual'
  return 'idle'
})

const triggerTitle = computed(() => {
  if (!props.connectionId) return t('console.transaction.noConnection')
  if (props.canManage === false) {
    return isUnsavedConnectionId(props.connectionId)
        ? t('console.transaction.unsavedConnectionHint')
        : t('console.transaction.dmlAccessDenied')
  }
  return `${t('console.transaction.menuTitle')} · ${statusLabel.value}`
})

const manualModeDisabledHint = computed(() => {
  if (props.canManage !== false) return ''
  return isUnsavedConnectionId(props.connectionId)
      ? t('console.transaction.unsavedConnectionHint')
      : t('console.transaction.dmlAccessDenied')
})

function closeMenu() {
  open.value = false
}

function toggleMenu() {
  if (!props.connectionId || props.canManage === false) return
  open.value = !open.value
}

async function runAction(action: () => void | Promise<void>) {
  await action()
  closeMenu()
}

defineExpose({
  refreshStatus: transaction.refreshStatus,
})

usePopoverEscape(open, closeMenu, {
  containRefs: () => [rootRef.value],
})
</script>

<template>
  <div
      ref="rootRef"
      class="txn-bar"
      :class="[`is-${statusTone}`, { open, 'is-loading': transaction.loading.value }]"
  >
    <button
        class="txn-trigger"
        type="button"
        :disabled="!connectionId || transaction.loading.value || canManage === false"
        :title="triggerTitle"
        @click="toggleMenu"
    >
      <span class="txn-dot" aria-hidden="true"/>
      <span class="txn-value">{{ compactStatusLabel }}</span>
      <DwIcon class="txn-caret" name="chevron-down" size="xs" :stroke-width="1.5"/>
    </button>

    <div v-if="isPending" class="txn-quick">
      <button
          class="dw-text-btn txn-quick-btn--commit"
          type="button"
          :disabled="!transaction.canCommit() || transaction.loading.value || canManage === false"
          @click="transaction.commit()"
      >
        {{ t('console.transaction.commit') }}
      </button>
      <button
          class="dw-text-btn txn-quick-btn--rollback"
          type="button"
          :disabled="!transaction.canRollback() || transaction.loading.value || canManage === false"
          @click="transaction.rollback()"
      >
        {{ t('console.transaction.rollback') }}
      </button>
    </div>

    <div v-if="open" class="txn-menu">
      <div class="txn-menu-head">
        <span class="txn-menu-dot" aria-hidden="true"/>
        <span>{{ statusLabel }}</span>
      </div>

      <button
          class="txn-item"
          type="button"
          :disabled="!transaction.canBegin() || transaction.loading.value || canManage === false"
          @click="runAction(transaction.begin)"
      >
        <span class="txn-item-label">{{ t('console.transaction.begin') }}</span>
        <span class="txn-item-hint">{{ t('console.transaction.beginHint') }}</span>
      </button>
      <button
          class="txn-item"
          type="button"
          :disabled="!transaction.canCommit() || transaction.loading.value || canManage === false"
          @click="runAction(transaction.commit)"
      >
        <span class="txn-item-label">{{ t('console.transaction.commit') }}</span>
        <span class="txn-item-hint">{{ t('console.transaction.commitHint') }}</span>
      </button>
      <button
          class="txn-item"
          type="button"
          :disabled="!transaction.canRollback() || transaction.loading.value || canManage === false"
          @click="runAction(transaction.rollback)"
      >
        <span class="txn-item-label">{{ t('console.transaction.rollback') }}</span>
        <span class="txn-item-hint">{{ t('console.transaction.rollbackHint') }}</span>
      </button>

      <div class="txn-menu-divider"/>

      <button
          class="txn-mode"
          type="button"
          :class="{ active: transaction.status.value.autocommit }"
          :disabled="transaction.loading.value"
          @click="runAction(() => {
            if (!transaction.status.value.autocommit) transaction.toggleAutocommit()
          })"
      >
        <span>{{ t('console.transaction.autocommitOnLabel') }}</span>
        <DwIcon
            v-if="transaction.status.value.autocommit"
            class="txn-check"
            name="submit"
            size="xs"
            :stroke-width="1.6"
        />
      </button>
      <button
          class="txn-mode"
          type="button"
          :class="{ active: !transaction.status.value.autocommit }"
          :disabled="transaction.loading.value || canManage === false"
          :title="manualModeDisabledHint || undefined"
          @click="runAction(() => {
            if (transaction.status.value.autocommit) transaction.toggleAutocommit()
          })"
      >
        <span>{{ t('console.transaction.manualMode') }}</span>
        <DwIcon
            v-if="!transaction.status.value.autocommit"
            class="txn-check"
            name="submit"
            size="xs"
            :stroke-width="1.6"
        />
      </button>
    </div>
  </div>
</template>

<style scoped>
.txn-bar {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  height: auto;
}

.txn-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  height: var(--dw-console-btn-size);
  min-width: 0;
  padding: 0 var(--dw-space-3);
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius);
  background: transparent;
  color: var(--dw-text-secondary);
  transition: var(--dw-transition-colors);
}

.txn-trigger:hover:not(:disabled) {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  border-color: color-mix(in srgb, var(--dw-border) 80%, transparent);
}

.txn-bar.open .txn-trigger {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  border-color: color-mix(in srgb, var(--dw-border) 80%, transparent);
}

.txn-trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.txn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dw-success);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dw-success) 18%, transparent);
}

.txn-bar.is-manual .txn-dot {
  background: var(--mp-tone-amber);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--mp-tone-amber) 18%, transparent);
}

.txn-bar.is-pending .txn-dot {
  background: var(--dw-danger);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dw-danger) 18%, transparent);
}

.txn-bar.is-disabled .txn-dot {
  background: var(--dw-text-muted);
  box-shadow: none;
}

.txn-value {
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-text-xs);
  line-height: 1;
  font-weight: 500;
  color: inherit;
}

.txn-caret {
  flex-shrink: 0;
  color: var(--dw-text-muted);
  transition: transform var(--dw-duration) var(--dw-ease);
}

.txn-bar.open .txn-caret {
  transform: rotate(180deg);
}

.txn-quick {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-1);
}

.txn-quick-btn--commit {
  color: var(--dw-success-fg);
}

.txn-quick-btn--commit:hover:not(:disabled) {
  color: var(--dw-success-fg);
  border-color: color-mix(in srgb, var(--dw-success-fg) 28%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-success-fg) 10%, var(--dw-bg));
}

.txn-quick-btn--rollback {
  color: var(--dw-warning-fg);
}

.txn-quick-btn--rollback:hover:not(:disabled) {
  color: var(--dw-warning-fg);
  border-color: color-mix(in srgb, var(--dw-warning-fg) 28%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-warning-fg) 10%, var(--dw-bg));
}

.txn-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--dw-z-drawer);
  width: 220px;
  padding: var(--dw-space-2);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
  box-shadow: var(--dw-shadow-float);
}

.txn-menu-head {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  padding: var(--dw-space-4) var(--dw-space-5) var(--dw-space-5);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  font-weight: 600;
  border-bottom: 1px solid var(--dw-border-light);
  margin-bottom: var(--dw-space-1);
}

.txn-menu-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.txn-bar.is-idle .txn-menu-dot {
  color: var(--dw-success);
}

.txn-bar.is-manual .txn-menu-dot {
  color: var(--mp-tone-amber);
}

.txn-bar.is-pending .txn-menu-dot {
  color: var(--dw-danger);
}

.txn-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  padding: var(--dw-pad-control);
  border-radius: var(--dw-control-radius-sm);
  text-align: left;
  transition: background var(--dw-duration-fast) var(--dw-ease);
}

.txn-item:hover:not(:disabled) {
  background: var(--dw-bg-hover);
}

.txn-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.txn-item-label {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text);
}

.txn-item-hint {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.txn-menu-divider {
  height: 1px;
  margin: var(--dw-space-2) var(--dw-space-3);
  background: var(--dw-border-light);
}

.txn-mode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--dw-pad-control);
  border-radius: var(--dw-control-radius-sm);
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
  transition: background var(--dw-duration-fast) var(--dw-ease);
}

.txn-mode:hover:not(:disabled) {
  background: var(--dw-bg-hover);
}

.txn-mode.active {
  background: var(--dw-bg-hover);
  font-weight: 600;
}

.txn-check {
  flex-shrink: 0;
  color: var(--dw-text-secondary);
}
</style>

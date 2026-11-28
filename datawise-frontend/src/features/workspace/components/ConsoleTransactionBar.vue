<script setup lang="ts">
/**
 * DataGrip-style txn chrome: [Commit] [Rollback] [Tx: A|M]
 * Tx is a single toggle — click to flip Auto ↔ Manual (no dropdown).
 * Commit/Rollback icons always visible; enabled only when manual + pending.
 */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import IconButton from '@/core/components/IconButton.vue'
import ConsoleToolbarIcon from '@/core/components/ConsoleToolbarIcon.vue'
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

const transaction = useConsoleTransaction({
  sessionKey: () => props.tabId,
  connectionId: () => props.connectionId,
  database: () => props.database,
})

const isManual = computed(() => isManualTransactionMode(transaction.status.value))
const isPending = computed(() => isManual.value && transaction.status.value.pending)

const compactStatusLabel = computed(() => {
  if (!props.connectionId) return 'Tx: —'
  return isManual.value
    ? t('console.transaction.compactManual')
    : t('console.transaction.compactAutocommit')
})

const statusTone = computed<'idle' | 'manual' | 'pending' | 'disabled'>(() => {
  if (!props.connectionId) return 'disabled'
  if (props.canManage === false) return 'disabled'
  if (isPending.value) return 'pending'
  if (isManual.value) return 'manual'
  return 'idle'
})

const commitEnabled = computed(() =>
  Boolean(
    props.connectionId
    && props.canManage !== false
    && isPending.value
    && transaction.canCommit()
    && !transaction.loading.value,
  ),
)

const rollbackEnabled = computed(() =>
  Boolean(
    props.connectionId
    && props.canManage !== false
    && isPending.value
    && transaction.canRollback()
    && !transaction.loading.value,
  ),
)

const toggleEnabled = computed(() =>
  Boolean(
    props.connectionId
    && props.canManage !== false
    && !transaction.loading.value,
  ),
)

const commitTitle = computed(() => {
  if (!props.connectionId) return t('console.transaction.noConnection')
  if (props.canManage === false) {
    return isUnsavedConnectionId(props.connectionId)
      ? t('console.transaction.unsavedConnectionHint')
      : t('console.transaction.dmlAccessDenied')
  }
  if (!isManual.value) return t('console.transaction.commitNeedsManual')
  if (!isPending.value) return t('console.transaction.commitNeedsPending')
  return t('console.transaction.commitHint')
})

const rollbackTitle = computed(() => {
  if (!props.connectionId) return t('console.transaction.noConnection')
  if (props.canManage === false) {
    return isUnsavedConnectionId(props.connectionId)
      ? t('console.transaction.unsavedConnectionHint')
      : t('console.transaction.dmlAccessDenied')
  }
  if (!isManual.value) return t('console.transaction.rollbackNeedsManual')
  if (!isPending.value) return t('console.transaction.rollbackNeedsPending')
  return t('console.transaction.rollbackHint')
})

const toggleTitle = computed(() => {
  if (!props.connectionId) return t('console.transaction.noConnection')
  if (props.canManage === false) {
    return isUnsavedConnectionId(props.connectionId)
      ? t('console.transaction.unsavedConnectionHint')
      : t('console.transaction.dmlAccessDenied')
  }
  return isManual.value
    ? t('console.transaction.toggleToAutocommit')
    : t('console.transaction.toggleToManual')
})

function onToggleMode() {
  if (!toggleEnabled.value) return
  transaction.toggleAutocommit()
}

defineExpose({
  refreshStatus: transaction.refreshStatus,
})
</script>

<template>
  <div
      class="txn-bar"
      :class="[`is-${statusTone}`, { 'is-loading': transaction.loading.value }]"
  >
    <IconButton
        class="txn-icon-btn txn-icon-btn--commit"
        :disabled="!commitEnabled"
        :title="commitTitle"
        :aria-label="t('console.transaction.commit')"
        @click="transaction.commit()"
    >
      <ConsoleToolbarIcon name="submit"/>
    </IconButton>
    <IconButton
        class="txn-icon-btn txn-icon-btn--rollback"
        :disabled="!rollbackEnabled"
        :title="rollbackTitle"
        :aria-label="t('console.transaction.rollback')"
        @click="transaction.rollback()"
    >
      <ConsoleToolbarIcon name="rollback"/>
    </IconButton>

    <button
        class="txn-trigger"
        type="button"
        :disabled="!toggleEnabled"
        :title="toggleTitle"
        :aria-label="toggleTitle"
        @click="onToggleMode"
    >
      <span class="txn-value">{{ compactStatusLabel }}</span>
    </button>
  </div>
</template>

<style scoped>
.txn-bar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: auto;
}

.txn-icon-btn--commit:not(:disabled) {
  color: var(--dw-success);
}

.txn-icon-btn--rollback:not(:disabled) {
  color: var(--dw-warning-fg, var(--dw-warning));
}

.txn-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--dw-console-btn-size);
  min-width: 3.25rem;
  padding: 0 var(--dw-space-2);
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

.txn-bar.is-manual .txn-trigger,
.txn-bar.is-pending .txn-trigger {
  color: var(--dw-text);
}

.txn-bar.is-pending .txn-trigger {
  color: var(--dw-danger);
}

.txn-trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.txn-value {
  white-space: nowrap;
  font-size: var(--dw-text-xs);
  line-height: 1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: inherit;
  font-family: var(--dw-font-mono, ui-monospace, monospace);
}
</style>

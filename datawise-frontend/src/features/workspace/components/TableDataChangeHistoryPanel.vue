<script setup lang="ts">
import {ref, watch} from 'vue'
import type {TableDataChangeAuditEntry, TableDataChangeOperation} from '@/shared/api/types'
import {tableDataApi} from '@/api'
import {useI18n} from 'vue-i18n'
import {askAppConfirm, DwButton, DwPanelState} from '@/core/components'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {summarizeAuditEntryChanges} from '@/features/workspace/services/table-data-audit.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
    tableName?: string
    connectionId?: string
    database?: string
    canRestore?: boolean
    refreshToken?: number
}>()

const emit = defineEmits<{
    restored: []
}>()

const {t, locale} = useI18n()
const layout = useLayoutStore()
const expanded = ref(false)
const loading = ref(false)
const restoringId = ref<string | null>(null)
const entries = ref<TableDataChangeAuditEntry[]>([])
const entryCount = ref(0)
const loadError = ref<string | null>(null)

async function loadAudit() {
    loadError.value = null
    if (!props.tableName?.trim() || !props.connectionId) {
        entries.value = []
        entryCount.value = 0
        return
    }
    loading.value = true
    try {
        entries.value = await tableDataApi.listAudit(props.tableName, {
            connectionId: props.connectionId,
            database: props.database,
            limit: 50,
        })
        entryCount.value = entries.value.length
    } catch (error) {
        entries.value = []
        entryCount.value = 0
        loadError.value = resolveCaughtApiErrorMessage(error, t, 'dataGrid.audit.loadFailed')
    } finally {
        loading.value = false
    }
}

watch(
    () => [props.tableName, props.connectionId, props.database, props.refreshToken] as const,
    () => {
        void loadAudit()
    },
    {immediate: true},
)

function toggleExpanded() {
    expanded.value = !expanded.value
    if (expanded.value) void loadAudit()
}

async function restoreEntry(entry: TableDataChangeAuditEntry) {
    if (!props.tableName?.trim() || !props.connectionId || entry.reverted) return
    if (restoringId.value) return
    const confirmed = await askAppConfirm({
        title: t('dataGrid.audit.restoreConfirmTitle'),
        message: t('dataGrid.audit.restoreConfirmMessage', {
            operation: operationLabel(entry.operation),
            primaryKey: summarizePrimaryKey(entry),
        }),
        confirmLabel: t('dataGrid.audit.restore'),
        confirmVariant: 'danger',
    })
    if (!confirmed) return
    restoringId.value = entry.id
    try {
        await tableDataApi.restoreAudit(props.tableName, entry.id, {
            connectionId: props.connectionId,
            database: props.database,
        })
        emit('restored')
        await loadAudit()
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'dataGrid.audit.restoreFailed')
        layout.showErrorToast(message)
    } finally {
        restoringId.value = null
    }
}

function formatTime(ms: number): string {
    return new Date(ms).toLocaleString(locale.value)
}

function summarizePrimaryKey(entry: TableDataChangeAuditEntry): string {
    const primaryKey = entry.primaryKey
    if (!primaryKey || Object.keys(primaryKey).length === 0) return '—'
    return Object.entries(primaryKey)
        .map(([column, value]) => `${column}=${String(value ?? '')}`)
        .join(', ')
}

function operationLabel(operation: TableDataChangeOperation): string {
    return t(`dataGrid.audit.operation.${operation.toLowerCase()}`)
}

function canRestoreEntry(entry: TableDataChangeAuditEntry): boolean {
    return Boolean(props.canRestore)
        && !entry.reverted
        && entry.operation !== 'RESTORE'
}
</script>

<template>
  <section class="table-data-audit" :class="{ 'is-expanded': expanded }">
    <button type="button" class="table-data-audit__toggle" @click="toggleExpanded">
      <span class="table-data-audit__title">{{ t('dataGrid.audit.title') }}</span>
      <span class="table-data-audit__meta">
        <span v-if="entryCount > 0">{{ entryCount }}</span>
        <span class="table-data-audit__chevron" aria-hidden="true">›</span>
      </span>
    </button>

    <div v-show="expanded" class="table-data-audit__body">
      <DwPanelState
          v-if="loading"
          status="loading"
          compact
          :message="t('dataGrid.audit.loading')"
      />
      <DwPanelState
          v-else-if="loadError"
          status="error"
          compact
          :message="loadError"
      >
        <template #actions>
          <DwButton variant="secondary" size="sm" type="button" @click="loadAudit()">
            {{ t('common.retry') }}
          </DwButton>
        </template>
      </DwPanelState>
      <DwPanelState
          v-else-if="entries.length === 0"
          status="empty"
          compact
          :message="t('dataGrid.audit.empty')"
      />
      <ul v-else class="table-data-audit__list">
        <li v-for="entry in entries" :key="entry.id" class="table-data-audit__item">
          <div class="table-data-audit__item-content">
            <div class="table-data-audit__item-main">
              <span class="table-data-audit__op" :data-op="entry.operation">{{ operationLabel(entry.operation) }}</span>
              <span class="table-data-audit__pk">{{ summarizePrimaryKey(entry) }}</span>
              <time class="table-data-audit__time">{{ formatTime(entry.createdAtMs) }}</time>
            </div>
            <p v-if="summarizeAuditEntryChanges(entry)" class="table-data-audit__changes">
              {{ t('dataGrid.audit.changes', {summary: summarizeAuditEntryChanges(entry)}) }}
            </p>
          </div>
          <div class="table-data-audit__item-actions">
            <span v-if="entry.reverted" class="table-data-audit__badge">{{ t('dataGrid.audit.reverted') }}</span>
            <button
                v-else-if="canRestoreEntry(entry)"
                type="button"
                class="table-data-audit__restore"
                :disabled="restoringId === entry.id"
                @click="restoreEntry(entry)"
            >
              {{ restoringId === entry.id ? t('dataGrid.audit.restoring') : t('dataGrid.audit.restore') }}
            </button>
          </div>
        </li>
      </ul>
      <p class="table-data-audit__footnote">{{ t('dataGrid.audit.footnote') }}</p>
    </div>
  </section>
</template>

<style scoped>
.table-data-audit {
  border-top: 1px solid var(--dw-border-subtle);
  background: var(--dw-surface-raised);
}

.table-data-audit__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-6);
  padding: var(--dw-space-4) var(--dw-space-6);
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.table-data-audit__title {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.table-data-audit__meta {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  font-size: var(--dw-text-xs);
  opacity: 0.75;
}

.table-data-audit__chevron {
  display: inline-block;
  transition: transform var(--dw-duration) var(--dw-ease);
}

.table-data-audit.is-expanded .table-data-audit__chevron {
  transform: rotate(90deg);
}

.table-data-audit__body {
  padding: 0 var(--dw-space-6) var(--dw-space-5);
}

.table-data-audit__hint,
.table-data-audit__footnote {
  margin: 0;
  font-size: var(--dw-text-xs);
  opacity: 0.8;
}

.table-data-audit__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  max-height: 180px;
  overflow: auto;
}

.table-data-audit__item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-gap-md);
  padding: var(--dw-pad-tight);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-surface);
}

.table-data-audit__item-content {
  min-width: 0;
  flex: 1;
}

.table-data-audit__changes {
  margin: var(--dw-space-2) 0 0;
  font-size: var(--dw-text-xs);
  opacity: 0.75;
}

.table-data-audit__item-main {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--dw-gap);
  align-items: center;
  font-size: var(--dw-text-xs);
}

.table-data-audit__op {
  font-weight: 600;
  text-transform: uppercase;
  font-size: var(--dw-text-xs);
  letter-spacing: 0.04em;
}

.table-data-audit__op[data-op='INSERT'] {
  color: var(--dw-success);
}

.table-data-audit__op[data-op='UPDATE'] {
  color: var(--dw-link);
}

.table-data-audit__op[data-op='DELETE'] {
  color: var(--dw-danger);
}

.table-data-audit__op[data-op='RESTORE'] {
  color: var(--dw-warning);
}

.table-data-audit__pk {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

.table-data-audit__time {
  opacity: 0.65;
  white-space: nowrap;
}

.table-data-audit__restore {
  border: 0;
  background: transparent;
  color: var(--dw-link);
  cursor: pointer;
  font-size: var(--dw-text-xs);
  padding: 0;
}

.table-data-audit__restore:disabled {
  opacity: 0.6;
  cursor: default;
}

.table-data-audit__badge {
  font-size: var(--dw-text-xs);
  opacity: 0.7;
}
</style>

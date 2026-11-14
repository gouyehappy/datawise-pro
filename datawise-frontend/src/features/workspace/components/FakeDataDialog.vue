<script setup lang="ts">
import {computed, ref, toRef, useId, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  AppModal,
  DwButton,
  DwCheckbox,
  DwInlineAlert,
  DwPanelState,
  DwInputAction,
} from '@/core/components'
import type {TablePropertiesResult} from '@/shared/api/types'
import type {TableRow} from '@/core/types'
import {
    clampFakeDataRowCount,
    columnsForFakeInsert,
    FAKE_DATA_DEFAULT_ROWS,
    FAKE_DATA_MAX_ROWS,
    FAKE_DATA_PREVIEW_ROWS,
} from '@/features/workspace/services/fake-data.service'
import {useModalFeedback} from '@/core/composables/useModalFeedback'

const props = defineProps<{
  open: boolean
  loading?: boolean
  executing?: boolean
  tableName?: string
  properties: TablePropertiesResult | null
  previewRows?: TableRow[] | null
  previewSql?: string | null
  previewLoading?: boolean
  errorMessage?: string
  canExecute?: boolean
  executeDisabledHint?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  execute: [rowCount: number]
  export: [rowCount: number]
  'refresh-preview': [rowCount: number]
}>()

const {t} = useI18n()
const {feedback, showSuccess, showError, clearFeedback} = useModalFeedback(toRef(props, 'open'))
const rowCount = ref(FAKE_DATA_DEFAULT_ROWS)
const rowCountError = ref('')
const rowCountInputId = useId()
const activeView = ref<'data' | 'sql'>('data')
const sqlWrap = ref(false)

const insertColumns = computed(() =>
    props.properties ? columnsForFakeInsert(props.properties.columns) : [],
)

const previewRows = computed(() => props.previewRows ?? [])
const hasSqlPreview = computed(() => !!props.previewSql?.trim())
const previewSqlText = computed(() => {
    const sql = props.previewSql ?? ''
    const lines = sql.split('\n')
    const maxLines = 60
    const head = lines.slice(0, maxLines).join('\n')
    if (lines.length > maxLines) return head + '\n...'
    return head
})

const previewColumnNames = computed(() => insertColumns.value.map((column) => column.name))

const metaText = computed(() =>
    t('workspace.fakeData.metaLine', {
      columns: insertColumns.value.length,
      preview: FAKE_DATA_PREVIEW_ROWS,
      max: FAKE_DATA_MAX_ROWS,
    }),
)

watch(
    () => props.open,
    (isOpen) => {
      if (!isOpen) return
      rowCount.value = FAKE_DATA_DEFAULT_ROWS
      rowCountError.value = ''
      activeView.value = 'data'
      sqlWrap.value = false
      clearFeedback()
    },
)

function close() {
  emit('update:open', false)
}

function validateRowCount(): number | null {
  const value = clampFakeDataRowCount(rowCount.value)
  if (value < 1 || value > FAKE_DATA_MAX_ROWS) {
    rowCountError.value = t('workspace.fakeData.rowCountInvalid', {max: FAKE_DATA_MAX_ROWS})
    return null
  }
  rowCountError.value = ''
  rowCount.value = value
  return value
}

function onExecute() {
  const count = validateRowCount()
  if (count == null) return
  emit('execute', count)
}

function onExport() {
  const count = validateRowCount()
  if (count == null) return
  emit('export', count)
}

function onRefreshPreview() {
  const count = validateRowCount()
  if (count == null) return
  emit('refresh-preview', count)
}

async function copySql() {
  const sql = props.previewSql?.trim()
  if (!sql) return
  try {
    await navigator.clipboard.writeText(sql)
    showSuccess(t('explorer.exportSqlCopied'))
  } catch {
    showError(t('explorer.exportSqlFailed'))
  }
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('workspace.fakeData.title', {table: tableName || '—'})"
      :subtitle="t('workspace.fakeData.subtitle')"
      width="880px"
      max-height="min(90vh, 780px)"
      @close="close"
  >
    <DwPanelState
        v-if="loading"
        status="loading"
        :message="t('workspace.fakeData.loading')"
        fill
    />

    <DwPanelState
        v-else-if="!insertColumns.length"
        status="empty"
        :message="t('workspace.fakeData.noColumns')"
        fill
    />

    <div v-else class="fake-data-modal">
      <div class="fake-data-toolbar">
        <div class="fake-data-toolbar__lead">
          <label class="fake-data-toolbar__label" :for="rowCountInputId">
            {{ t('workspace.fakeData.rowCountLabel') }}
          </label>
          <DwInputAction
              :id="rowCountInputId"
              v-model="rowCount"
              class="fake-data-toolbar__input"
              variant="sm"
              type="number"
              :min="1"
              :max="FAKE_DATA_MAX_ROWS"
              :action-label="t('common.refresh')"
              action-icon="refresh"
              :action-disabled="previewLoading || executing"
              :action-loading="previewLoading"
              :aria-invalid="rowCountError ? 'true' : undefined"
              @action="onRefreshPreview"
          />
          <span class="fake-data-toolbar__meta">{{ metaText }}</span>
        </div>

        <div
            class="dw-segment dw-segment--sm fake-data-toolbar__views"
            role="tablist"
            :aria-label="t('workspace.fakeData.viewLabel')"
        >
          <button
              type="button"
              class="dw-segment__btn dw-segment__btn--label"
              :class="{'is-active': activeView === 'data'}"
              role="tab"
              :aria-selected="activeView === 'data'"
              @click="activeView = 'data'"
          >
            {{ t('workspace.fakeData.viewPreview') }}
          </button>
          <button
              type="button"
              class="dw-segment__btn dw-segment__btn--label"
              :class="{'is-active': activeView === 'sql'}"
              role="tab"
              :aria-selected="activeView === 'sql'"
              @click="activeView = 'sql'"
          >
            {{ t('workspace.fakeData.viewSql') }}
          </button>
        </div>
      </div>

      <DwInlineAlert :message="rowCountError"/>
      <p class="modal-body-hint">{{ t('workspace.fakeData.auditHint') }}</p>

      <section v-show="activeView === 'data'" class="fake-data-stage">
        <header class="modal-preview-section__head">
          <span>{{ t('workspace.fakeData.previewTitle') }}</span>
          <span class="modal-preview-section__meta">
            {{ previewLoading
              ? t('workspace.fakeData.loading')
              : t('workspace.fakeData.previewRowsMeta', {count: previewRows.length}) }}
          </span>
        </header>
        <div class="modal-data-table-wrap modal-data-table-wrap--grow">
          <table class="modal-data-table">
            <thead>
              <tr>
                <th class="is-index">#</th>
                <th v-for="column in previewColumnNames" :key="column">{{ column }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in previewRows" :key="rowIndex">
                <td class="is-index">{{ rowIndex + 1 }}</td>
                <td v-for="column in previewColumnNames" :key="column">
                  {{ row[column] ?? 'NULL' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-show="activeView === 'sql'" class="fake-data-stage">
        <header class="modal-preview-section__head">
          <span>{{ t('workspace.fakeData.sqlTitle') }}</span>
          <div class="fake-data-stage__actions">
            <DwCheckbox v-model="sqlWrap" :label="t('workspace.fakeData.wrap')"/>
            <DwButton
                variant="secondary"
                size="sm"
                type="button"
                :disabled="!hasSqlPreview"
                @click="copySql"
            >
              {{ t('workspace.fakeData.copySql') }}
            </DwButton>
          </div>
        </header>
        <pre
            class="modal-code-block fake-data-sql"
            :class="{'is-wrap': sqlWrap}"
        >{{ previewSqlText || '--' }}</pre>
      </section>

      <DwInlineAlert
          v-if="executing"
          density="banner"
          variant="info"
          :message="t('workspace.fakeData.executing')"
      />
      <DwInlineAlert
          v-else-if="errorMessage"
          density="banner"
          :message="errorMessage"
      />
      <DwInlineAlert
          v-else-if="feedback"
          density="banner"
          :variant="feedback.variant"
          :message="feedback.message"
      />
    </div>

    <template #footer>
      <DwButton variant="ghost" type="button" @click="close">
        {{ t('common.cancel') }}
      </DwButton>
      <DwButton
          variant="secondary"
          type="button"
          :disabled="loading || executing || !insertColumns.length"
          :title="t('workspace.fakeData.exportHint')"
          @click="onExport"
      >
        {{ t('workspace.fakeData.export') }}
      </DwButton>
      <DwButton
          variant="primary"
          type="button"
          :disabled="loading || executing || !canExecute || !insertColumns.length"
          :title="!canExecute ? executeDisabledHint : undefined"
          @click="onExecute"
      >
        {{ executing ? t('workspace.fakeData.executing') : t('workspace.fakeData.execute') }}
      </DwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.fake-data-modal {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--dw-space-6);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.fake-data-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap-md) var(--dw-space-7);
  flex-shrink: 0;
}

.fake-data-toolbar__lead {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.fake-data-toolbar__label {
  flex-shrink: 0;
  margin: 0;
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-secondary);
  white-space: nowrap;
}

.fake-data-toolbar__input {
  width: 76px;
  flex-shrink: 0;
}

.fake-data-toolbar__input :deep(.dw-input) {
  height: var(--dw-control-h-sm);
  min-height: var(--dw-control-h-sm);
  max-height: var(--dw-control-h-sm);
  padding-top: 0;
  padding-bottom: 0;
  padding-left: var(--dw-space-4);
}

.fake-data-toolbar__meta {
  margin: 0;
  min-width: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fake-data-toolbar__views {
  flex-shrink: 0;
}

.fake-data-stage {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--dw-gap);
  min-width: 0;
  min-height: 280px;
  height: 0;
  overflow: hidden;
}

.fake-data-stage__actions {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-md);
}

.fake-data-sql {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  white-space: pre;
  word-break: normal;
  font-family: var(--dw-font-mono);
}

.fake-data-sql.is-wrap {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.fake-data-stage :deep(.modal-data-table) {
  width: max-content;
  min-width: 100%;
}

.fake-data-stage :deep(.modal-data-table th.is-index),
.fake-data-stage :deep(.modal-data-table td.is-index) {
  position: sticky;
  left: 0;
  z-index: var(--dw-z-raised);
  min-width: 42px;
  text-align: right;
  color: var(--dw-text-muted);
  background: var(--dw-bg-panel);
  border-right: 1px solid var(--dw-border-light);
}

@media (max-width: 720px) {
  .fake-data-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .fake-data-toolbar__lead {
    flex-wrap: wrap;
  }

  .fake-data-toolbar__meta {
    width: 100%;
    white-space: normal;
  }

  .fake-data-toolbar__views {
    width: 100%;
  }
}
</style>

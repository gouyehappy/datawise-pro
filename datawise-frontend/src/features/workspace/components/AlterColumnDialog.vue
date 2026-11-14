<script setup lang="ts">
import {computed, nextTick, ref, toRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwCheckbox, DwConfirmAlert, DwInlineAlert, DwSelect, DwInput, FormField} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import type {DbType} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import {
    buildAlterColumnSql,
    type AlterColumnOperation,
    type AlterColumnSpec,
} from '@/features/workspace/services/alter-column-ddl.service'
import ColumnDataTypeCombobox from '@/features/workspace/components/ColumnDataTypeCombobox.vue'
import {useModalFeedback} from '@/core/composables/useModalFeedback'
import type {ModalFeedback} from '@/core/composables/useModalFeedback'

const props = defineProps<{
  open: boolean
  dbType?: DbType
  tableName: string
  database?: string
  columns: TableColumnDetail[]
  canExecute?: boolean
  executeDisabledHint?: string
  executing?: boolean
  productionEnv?: boolean
  /** Prefill when the dialog opens (e.g. ER graph column double-click). */
  initialOperation?: AlterColumnOperation
  initialColumnName?: string
  /** 父级执行结果反馈（弹窗打开时禁止 toast） */
  actionFeedback?: ModalFeedback | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'open-console': [sql: string]
  execute: [sql: string]
  'clear-action-feedback': []
}>()

const {t} = useI18n()
const {feedback, showSuccess, showError, clearFeedback} = useModalFeedback(toRef(props, 'open'))

const operation = ref<AlterColumnOperation>('add')
const selectedColumn = ref('')
const columnName = ref('')
const dataType = ref('VARCHAR(255)')
const nullable = ref(true)
const autoIncrement = ref(false)
const defaultValue = ref('')
const confirmArmed = ref(false)

const operations: AlterColumnOperation[] = ['add', 'modify', 'drop']

const columnOptions = computed<SelectOption[]>(() =>
    props.columns.map((column) => ({
      value: column.name,
      label: column.name,
    })),
)

const showMysqlAutoIncrement = computed(
    () => props.dbType === 'mysql' || props.dbType === 'mariadb',
)

const columnSpec = computed<AlterColumnSpec>(() => ({
  name: columnName.value,
  dataType: dataType.value,
  nullable: nullable.value,
  autoIncrement: autoIncrement.value,
  defaultValue: defaultValue.value.trim() || null,
}))

const generatedSql = computed(() =>
    buildAlterColumnSql(operation.value, {
      dbType: props.dbType,
      tableName: props.tableName,
      database: props.database,
      column: columnSpec.value,
    }),
)

const canSubmit = computed(() => !!generatedSql.value?.trim())
const executeEnabled = computed(() => canSubmit.value && props.canExecute !== false && !props.executing)

const confirmMessage = computed(() => {
  if (operation.value === 'drop') {
    return t('workspace.tableDetail.alterColumn.confirmDrop', {
      column: columnName.value || selectedColumn.value,
    })
  }
  return t('workspace.tableDetail.alterColumn.confirmAlter')
})

const bannerFeedback = computed(() => props.actionFeedback ?? feedback.value)

function applyColumn(column: TableColumnDetail | undefined) {
  if (!column) {
    columnName.value = ''
    dataType.value = 'VARCHAR(255)'
    nullable.value = true
    autoIncrement.value = false
    defaultValue.value = ''
    return
  }
  columnName.value = column.name
  dataType.value = column.dataType || 'VARCHAR(255)'
  nullable.value = column.nullable
  autoIncrement.value = column.autoIncrement
  defaultValue.value = column.defaultValue != null ? String(column.defaultValue) : ''
}

function hydrateFromInitial() {
  confirmArmed.value = false
  clearFeedback()
  emit('clear-action-feedback')
  const initialOp = props.initialOperation ?? 'add'
  operation.value = initialOp
  if (initialOp === 'add') {
    selectedColumn.value = ''
    applyColumn(undefined)
    return
  }
  const preferred = props.initialColumnName?.trim()
  void nextTick(() => {
    const column = preferred
        ? props.columns.find((item) => item.name === preferred) ?? props.columns[0]
        : props.columns[0]
    selectedColumn.value = column?.name ?? ''
    applyColumn(column)
  })
}

watch(
    () => props.open,
    (open) => {
      if (open) hydrateFromInitial()
    },
)

watch([operation, columnName, dataType, nullable, autoIncrement, defaultValue, selectedColumn], () => {
  confirmArmed.value = false
  clearFeedback()
  emit('clear-action-feedback')
})

watch(operation, (op) => {
  if (op === 'add') {
    selectedColumn.value = ''
    applyColumn(undefined)
    return
  }
  const first = props.columns[0]
  selectedColumn.value = first?.name ?? ''
  applyColumn(first)
})

watch(selectedColumn, (name) => {
  if (operation.value === 'add') return
  const column = props.columns.find((item) => item.name === name)
  applyColumn(column)
})

function close() {
  if (props.executing) return
  emit('update:open', false)
}

async function copySql() {
  const sql = generatedSql.value?.trim()
  if (!sql) return
  try {
    await navigator.clipboard.writeText(sql)
    showSuccess(t('workspace.tableDetail.alterColumn.copied'))
  } catch {
    showError(t('workspace.tableDetail.alterColumn.copyFailed'))
  }
}

function openInConsole() {
  const sql = generatedSql.value?.trim()
  if (!sql) return
  emit('open-console', sql)
  close()
}

function onExecuteClick() {
  if (!executeEnabled.value) return
  if (!confirmArmed.value) {
    confirmArmed.value = true
    return
  }
  const sql = generatedSql.value?.trim()
  if (!sql) return
  clearFeedback()
  emit('clear-action-feedback')
  emit('execute', sql)
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('workspace.tableDetail.alterColumn.title')"
      :subtitle="t('workspace.tableDetail.alterColumn.subtitle', {table: tableName})"
      width="680px"
      @close="close"
  >
    <div class="modal-form">
      <div class="dw-segment" role="tablist">
        <button
            v-for="option in operations"
            :key="option"
            type="button"
            class="dw-segment__btn"
            :class="{ 'is-active': operation === option }"
            role="tab"
            :aria-selected="operation === option"
            :disabled="executing"
            @click="operation = option"
        >
          {{ t(`workspace.tableDetail.alterColumn.ops.${option}`) }}
        </button>
      </div>

      <div class="modal-form-grid">
        <FormField
            v-if="operation !== 'add'"
            :label="t('workspace.tableDetail.alterColumn.existingColumn')"
        >
          <template #default="{ id }">
            <DwSelect
                :id="id"
                v-model="selectedColumn"
                :options="columnOptions"
                :disabled="executing"
                :clearable="false"
            />
          </template>
        </FormField>

        <FormField
            v-if="operation === 'add'"
            :label="t('workspace.tableDetail.columnName')"
        >
          <template #default="{ id }">
            <DwInput
                :id="id"
                v-model="columnName"
                type="text"
                autocomplete="off"
                :spellcheck="false"
                :disabled="executing"
            />
          </template>
        </FormField>

        <FormField
            v-if="operation !== 'drop'"
            :label="t('workspace.tableDetail.dataType')"
        >
          <template #default="{ id }">
            <ColumnDataTypeCombobox
                :id="id"
                v-model="dataType"
                :db-type="dbType"
                placeholder="VARCHAR(255)"
                :disabled="executing"
            />
          </template>
        </FormField>

        <FormField
            v-if="operation !== 'drop'"
            :label="t('workspace.tableDetail.alterColumn.nullableLabel')"
        >
          <template #default="{ id }">
            <DwCheckbox
                :id="id"
                v-model="nullable"
                class="alter-column-check"
                :disabled="executing"
            >
              {{ t('workspace.tableDetail.alterColumn.allowNull') }}
            </DwCheckbox>
          </template>
        </FormField>

        <FormField
            v-if="operation !== 'drop' && showMysqlAutoIncrement"
            :label="t('workspace.tableDetail.autoIncrement')"
        >
          <template #default="{ id }">
            <DwCheckbox
                :id="id"
                v-model="autoIncrement"
                class="alter-column-check"
                :disabled="executing"
            >
              {{ t('workspace.tableDetail.alterColumn.autoIncrementHint') }}
            </DwCheckbox>
          </template>
        </FormField>

        <FormField
            v-if="operation !== 'drop'"
            :label="t('workspace.tableDetail.default')"
        >
          <template #default="{ id }">
            <DwInput
                :id="id"
                v-model="defaultValue"
                type="text"
                :placeholder="t('workspace.tableDetail.alterColumn.defaultPlaceholder')"
                autocomplete="off"
                :spellcheck="false"
                :disabled="executing"
            />
          </template>
        </FormField>
      </div>

      <p class="modal-body-hint">{{ t('workspace.tableDetail.alterColumn.hint') }}</p>

      <section class="modal-preview-section">
        <header class="modal-preview-section__head">
          <span>{{ t('workspace.tableDetail.alterColumn.preview') }}</span>
        </header>
        <pre class="modal-code-block modal-code-block--preview">{{
          generatedSql || t('workspace.tableDetail.alterColumn.previewEmpty')
        }}</pre>
      </section>

      <DwConfirmAlert
          v-if="confirmArmed"
          class="alter-column-confirm"
          :variant="operation === 'drop' || productionEnv ? 'danger' : 'warning'"
          :message="t('workspace.tableDetail.alterColumn.confirmTitle')"
          :hint="productionEnv
            ? `${confirmMessage} ${t('workspace.tableDetail.alterColumn.confirmProd')}`
            : confirmMessage"
      />

      <DwInlineAlert
          v-else-if="bannerFeedback"
          class="alter-column-confirm"
          density="banner"
          :variant="bannerFeedback.variant"
          :message="bannerFeedback.message"
      />

      <DwInlineAlert
          v-else-if="executeDisabledHint && canExecute === false"
          density="banner"
          variant="warning"
          :message="executeDisabledHint"
      />
    </div>

    <template #footer>
      <DwButton variant="ghost" type="button" :disabled="executing" @click="close">
        {{ t('common.cancel') }}
      </DwButton>
      <DwButton variant="ghost" type="button" :disabled="!canSubmit || executing" @click="copySql">
        {{ t('workspace.tableDetail.alterColumn.copy') }}
      </DwButton>
      <DwButton variant="ghost" type="button" :disabled="!canSubmit || executing" @click="openInConsole">
        {{ t('workspace.tableDetail.alterColumn.openConsole') }}
      </DwButton>
      <DwButton
          :variant="operation === 'drop' || confirmArmed ? 'danger' : 'primary'"
          type="button"
          :disabled="!executeEnabled"
          :loading="executing"
          @click="onExecuteClick"
      >
        {{
          executing
            ? t('workspace.tableDetail.alterColumn.executing')
            : confirmArmed
              ? t('workspace.tableDetail.alterColumn.executeConfirm')
              : t('workspace.tableDetail.alterColumn.execute')
        }}
      </DwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.alter-column-check {
  min-height: var(--dw-control-h);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
}

.alter-column-confirm {
  margin-top: var(--dw-space-4);
}
</style>

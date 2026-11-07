<script setup lang="ts">
import {computed, ref, toRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwInlineAlert, DwInput, FormField} from '@/core/components'
import type {TableColumn, TableRow} from '@/core/types'
import {
    buildResultDmlSql,
    type ResultDmlKind,
} from '@/features/workspace/services/result-dml.service'
import {useModalFeedback} from '@/core/composables/useModalFeedback'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

const props = withDefaults(
    defineProps<{
      open: boolean
      columns: TableColumn[]
      rows: TableRow[]
      /** selected = Shift/Ctrl multi-select; filtered = current visible result set */
      scope?: 'selected' | 'filtered'
      defaultTableName?: string
      pkColumns?: string[]
      connectionId?: string
      connectionName?: string
      database?: string
    }>(),
    {scope: 'filtered'},
)

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const {t} = useI18n()
const workspace = useWorkspaceStore()
const {feedback, showSuccess, showError, clearFeedback} = useModalFeedback(toRef(props, 'open'))

const tableName = ref('')
const kind = ref<ResultDmlKind>('insert')
const pkInput = ref('')

const kindOptions: ResultDmlKind[] = ['insert', 'update', 'delete']

watch(
    () => props.open,
    (open) => {
        if (!open) return
        tableName.value = props.defaultTableName?.trim() || 'query_result'
        kind.value = 'insert'
        pkInput.value = props.pkColumns?.join(', ') ?? inferPkFromColumns(props.columns)
        clearFeedback()
    },
)

function inferPkFromColumns(columns: TableColumn[]): string {
    const idCol = columns.find((col) => /^(id|.+_id)$/i.test(col.name))
    return idCol?.name ?? ''
}

const rowCount = computed(() => props.rows.length)

const generatedSql = computed(() =>
    buildResultDmlSql(
        kind.value,
        props.columns,
        props.rows,
        tableName.value,
        pkInput.value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
    ),
)

const needsPk = computed(() => kind.value !== 'insert')

const canOpenConsole = computed(() => Boolean(generatedSql.value.trim()))

const scopeHint = computed(() =>
    props.scope === 'selected'
        ? t('console.generateDml.scopeSelectedRows', {count: rowCount.value})
        : t('console.generateDml.scopeRows', {count: rowCount.value}),
)

function close() {
  emit('update:open', false)
}

async function copySql() {
  try {
    await navigator.clipboard.writeText(generatedSql.value)
    showSuccess(t('console.generateDml.copied'))
  } catch {
    showError(t('explorer.exportSqlFailed'))
  }
}

async function openInConsole() {
  if (!canOpenConsole.value) return
  try {
    await workspace.openConsole({
      connectionId: props.connectionId,
      connectionName: props.connectionName,
      database: props.database,
      sql: generatedSql.value,
      title: t('console.generateDml.consoleTitle', {table: tableName.value || 'table'}),
      appendSql: true,
    })
    close()
  } catch {
    showError(t('console.generateDml.openFailed'))
  }
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('console.generateDml.title')"
      :subtitle="scopeHint"
      width="680px"
      @close="close"
  >
    <div class="modal-form">
      <div class="dw-segment" role="tablist">
        <button
            v-for="option in kindOptions"
            :key="option"
            type="button"
            class="dw-segment__btn"
            :class="{ 'is-active': kind === option }"
            role="tab"
            :aria-selected="kind === option"
            @click="kind = option"
        >
          {{ t(`console.generateDml.${option}`) }}
        </button>
      </div>

      <div class="modal-form-grid">
        <FormField :label="t('console.generateDml.tableName')">
          <template #default="{ id }">
            <DwInput :id="id" v-model="tableName" type="text" />
          </template>
        </FormField>
        <FormField v-if="needsPk" :label="t('console.generateDml.pkColumns')">
          <template #default="{ id }">
            <DwInput :id="id" v-model="pkInput" type="text" placeholder="id" />
          </template>
        </FormField>
      </div>

      <p class="modal-body-hint">{{ t('console.generateDml.hint') }}</p>

      <section class="modal-preview-section">
        <header class="modal-preview-section__head">
          <span>{{ t('console.generateDml.preview') }}</span>
          <span class="modal-preview-section__meta">{{ rowCount }} {{ t('console.generateDml.rowsShort') }}</span>
        </header>
        <pre class="modal-code-block modal-code-block--preview">{{ generatedSql }}</pre>
      </section>

      <DwInlineAlert
          v-if="feedback"
          density="banner"
          :variant="feedback.variant"
          :message="feedback.message"
      />
    </div>

    <template #footer>
      <DwButton variant="ghost" type="button" @click="close">
        {{ t('common.cancel') }}
      </DwButton>
      <DwButton variant="ghost" type="button" @click="copySql">
        {{ t('console.generateDml.copy') }}
      </DwButton>
      <DwButton variant="primary" type="button" :disabled="!canOpenConsole" @click="openInConsole">
        {{ t('console.generateDml.openConsole') }}
      </DwButton>
    </template>
  </AppModal>
</template>

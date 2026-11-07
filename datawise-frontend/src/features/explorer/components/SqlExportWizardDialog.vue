<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwInlineAlert, DwInput, DwRadioGroup, FormField, ModalActions, type RadioOption} from '@/core/components'
import {
    MAX_RESULT_ROWS_MAX,
    MAX_RESULT_ROWS_MIN,
} from '@/features/settings/constants/editor-presets'
import {
    createDefaultBackupWizardForm,
    createDefaultSqlExportWizardForm,
    type SqlExportWizardContext,
    type SqlExportWizardForm,
    validateSqlExportWizardForm,
} from '@/features/explorer/services/sql-export-wizard.service'

const props = withDefaults(defineProps<{
    open: boolean
    context: SqlExportWizardContext | null
    maxRowsDefault: number
    exporting?: boolean
    /** export = SQL 导出；backup = 备份向导（默认结构+数据） */
    variant?: 'export' | 'backup'
    isProduction?: boolean
    actionError?: string | null
}>(), {
    variant: 'export',
    isProduction: false,
    actionError: null,
})

const emit = defineEmits<{
    'update:open': [value: boolean]
    export: [form: SqlExportWizardForm]
}>()

const {t} = useI18n()

const form = ref<SqlExportWizardForm>(createDefaultSqlExportWizardForm(props.maxRowsDefault))

const i18nPrefix = computed(() =>
    props.variant === 'backup' ? 'explorer.backupWizard' : 'explorer.sqlExportWizard',
)

const scopeLabel = computed(() => {
    const ctx = props.context
    if (!ctx) return ''
    if (ctx.scope === 'table') {
        return t(`${i18nPrefix.value}.scopeTable`, {table: ctx.tableName ?? '—'})
    }
    return t(`${i18nPrefix.value}.scopeDatabase`, {
        database: ctx.database,
        count: ctx.tableCount ?? 0,
    })
})

const connectionLabel = computed(() => props.context?.connectionLabel ?? props.context?.connectionId ?? '—')

const validationError = computed(() => {
    const code = validateSqlExportWizardForm(form.value)
    return code ? t(`${i18nPrefix.value}.errors.${code}`) : null
})

const canExport = computed(() => !validationError.value && !props.exporting)

const contentModeOptions = computed<RadioOption[]>(() => [
    {
        value: 'structure',
        label: t(`${i18nPrefix.value}.contentStructure`),
        hint: t(`${i18nPrefix.value}.contentStructureHint`),
    },
    {
        value: 'structureAndData',
        label: t(`${i18nPrefix.value}.contentStructureAndData`),
        hint: t(`${i18nPrefix.value}.contentStructureAndDataHint`),
    },
])

const outputOptions = computed<RadioOption[]>(() => [
    {value: 'download', label: t(`${i18nPrefix.value}.outputDownload`)},
    {value: 'clipboard', label: t(`${i18nPrefix.value}.outputClipboard`)},
])

watch(
    () => [props.open, props.variant, props.maxRowsDefault] as const,
    ([open]) => {
        if (!open) return
        form.value = props.variant === 'backup'
            ? createDefaultBackupWizardForm(props.maxRowsDefault)
            : createDefaultSqlExportWizardForm(props.maxRowsDefault)
    },
)

function close() {
    emit('update:open', false)
}

function submit() {
    if (!canExport.value) return
    emit('export', {...form.value})
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t(`${i18nPrefix}.title`)"
      :subtitle="t(`${i18nPrefix}.subtitle`)"
      width="520px"
      @close="close"
  >
    <form class="modal-form modal-form--compact" @submit.prevent="submit">
      <section class="modal-summary-box">
        <div class="modal-summary-row">
          <span class="modal-summary-row__label">{{ t(`${i18nPrefix}.connection`) }}</span>
          <span class="modal-summary-row__value">{{ connectionLabel }}</span>
        </div>
        <div class="modal-summary-row">
          <span class="modal-summary-row__label">{{ t(`${i18nPrefix}.scope`) }}</span>
          <span class="modal-summary-row__value">{{ scopeLabel }}</span>
        </div>
      </section>

      <DwInlineAlert
          v-if="variant === 'backup' && isProduction"
          :message="t('explorer.backupWizard.productionHint')"
          variant="warning"
          density="banner"
      />

      <FormField :label="t(`${i18nPrefix}.content`)" group>
        <DwRadioGroup
            v-model="form.contentMode"
            layout="list"
            name="sql-export-content-mode"
            :options="contentModeOptions"
        />
      </FormField>

      <FormField
          v-if="form.contentMode === 'structureAndData'"
          :label="t(`${i18nPrefix}.maxRows`)"
          :hint="t(`${i18nPrefix}.maxRowsHint`)"
      >
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="form.maxRows"
              type="number"
              :min="MAX_RESULT_ROWS_MIN"
              :max="MAX_RESULT_ROWS_MAX"
          />
        </template>
      </FormField>

      <FormField :label="t(`${i18nPrefix}.output`)" group>
        <DwRadioGroup
            v-model="form.output"
            layout="list"
            name="sql-export-output"
            :options="outputOptions"
        />
      </FormField>

      <DwInlineAlert :message="validationError"/>
      <DwInlineAlert v-if="actionError" :message="actionError" density="banner"/>
    </form>

    <template #footer>
      <ModalActions
          :confirm-label="exporting
            ? t(`${i18nPrefix}.exporting`)
            : t(`${i18nPrefix}.export`)"
          :confirm-disabled="!canExport"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>

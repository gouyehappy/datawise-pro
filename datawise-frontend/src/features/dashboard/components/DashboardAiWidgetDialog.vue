<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwSelect, DwInput, FormField} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {
    DASHBOARD_WIDGET_IDS,
    type DashboardWidgetColumn,
    type DashboardWidgetId,
} from '@/features/dashboard/services/dashboard-widget.service'
import {suggestDashboardWidgetFromPrompt} from '@/features/dashboard/services/dashboard-widget-ai.service'

const props = defineProps<{
    open: boolean
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    apply: [payload: { prompt: string; widgetId: DashboardWidgetId; column: DashboardWidgetColumn }]
}>()

const {t} = useI18n()

const prompt = ref('')
const selectedWidget = ref<DashboardWidgetId>('quickActions')
const selectedColumn = ref<DashboardWidgetColumn>('left')

const widgetOptions = computed<SelectOption[]>(() =>
    DASHBOARD_WIDGET_IDS.map((id) => ({
      value: id,
      label: t(`dashboard.widgets.${id}`),
    })),
)

const columnOptions = computed<SelectOption[]>(() =>
    (['left', 'main', 'right'] as DashboardWidgetColumn[]).map((col) => ({
      value: col,
      label: t(`dashboard.layoutDialog.columns.${col}`),
    })),
)

const suggestionReason = computed(() => suggestDashboardWidgetFromPrompt(prompt.value).reasonKey)

watch(
    () => props.open,
    (isOpen) => {
      if (!isOpen) return
      prompt.value = ''
      selectedWidget.value = 'quickActions'
      selectedColumn.value = 'left'
    },
)

watch(prompt, (value) => {
  const suggestion = suggestDashboardWidgetFromPrompt(value)
  selectedWidget.value = suggestion.widgetId
  selectedColumn.value = suggestion.column
})

function close() {
  emit('update:open', false)
}

function apply() {
  const normalized = prompt.value.trim()
  if (!normalized) return
  emit('apply', {
    prompt: normalized,
    widgetId: selectedWidget.value,
    column: selectedColumn.value,
  })
  close()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('dashboard.aiWidget.title')"
      :subtitle="t('dashboard.aiWidget.subtitle')"
      width="520px"
      @close="close"
  >
    <div class="modal-form">
      <FormField :label="t('dashboard.aiWidget.promptLabel')">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="prompt"
              :rows="4"
              :placeholder="t('dashboard.aiWidget.promptPlaceholder')"
          />
        </template>
      </FormField>
      <p class="modal-body-hint">
        {{ t('dashboard.aiWidget.suggestionHint', {reason: t(`dashboard.aiWidget.reason.${suggestionReason}`)}) }}
      </p>
      <div class="modal-grid-2">
        <FormField :label="t('dashboard.aiWidget.widgetLabel')">
          <DwSelect
              :model-value="selectedWidget"
              :options="widgetOptions"
              @update:model-value="selectedWidget = $event as DashboardWidgetId"
          />
        </FormField>
        <FormField :label="t('dashboard.aiWidget.columnLabel')">
          <DwSelect
              :model-value="selectedColumn"
              :options="columnOptions"
              @update:model-value="selectedColumn = $event as DashboardWidgetColumn"
          />
        </FormField>
      </div>
    </div>
    <template #footer>
      <DwButton variant="secondary" @click="close">
        {{ t('common.cancel') }}
      </DwButton>
      <DwButton variant="primary" :disabled="!prompt.trim()" @click="apply">
        {{ t('dashboard.aiWidget.apply') }}
      </DwButton>
    </template>
  </AppModal>
</template>


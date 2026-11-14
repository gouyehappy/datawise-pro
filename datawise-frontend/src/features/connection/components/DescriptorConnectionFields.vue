<script setup lang="ts">
/**
 * Descriptor-driven connection fields — shared by community plugins and
 * MetaForge S1 builtin packs. Same field schema as PluginConnectionFields.
 */
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwCheckbox, DwInput, DwSecretInput, DwSelect} from '@/core/components'
import ConnectionFormField from '@/features/connection/components/ConnectionFormField.vue'
import type {ConnectionConfig} from '@/core/types'
import {
  collectFieldValues,
  filterVisibleDescriptorFields,
  isDescriptorFieldRequired,
  readDescriptorFieldValue,
  readHttpEndpointDisplay,
  writeDescriptorFieldValue,
  writeHttpEndpointDisplay,
  type DescriptorFormField,
  type DescriptorWriteOptions,
} from '@/features/connection/forms/descriptor-connection-bindings'

const form = defineModel<ConnectionConfig>('form', {required: true})

const props = withDefaults(
  defineProps<{
    fields: DescriptorFormField[]
    readOnly?: boolean
    /** Host / bootstrap validation message. */
    hostError?: string
    /** Pasteable HTTP endpoint validation message. */
    endpointError?: string
    /** Builtin connectors use key=value lines; plugins keep JSON (default). */
    configStorage?: DescriptorWriteOptions['configStorage']
    resolveLabel?: (field: DescriptorFormField) => string
    resolveHint?: (field: DescriptorFormField) => string
    resolvePlaceholder?: (field: DescriptorFormField) => string
    resolveOptionLabel?: (field: DescriptorFormField, option: {label?: string; value: string}) => string
  }>(),
  {readOnly: false, configStorage: 'json'},
)

const {t, te} = useI18n()

const writeOpts = computed<DescriptorWriteOptions>(() => ({
  configStorage: props.configStorage,
}))

/** Draft buffer so paste/format does not fight the caret while typing. */
const httpDraft = ref('')
const httpFocused = ref(false)

function syncHttpDraftFromForm() {
  if (httpFocused.value) return
  httpDraft.value = readHttpEndpointDisplay(form.value)
}

watch(
  () => [form.value.dbType, form.value.host, form.value.port, form.value.advancedConfig] as const,
  () => syncHttpDraftFromForm(),
  {immediate: true},
)

function translateMaybe(raw: string | undefined, fallback = ''): string {
  const value = (raw || '').trim()
  if (!value) return fallback
  if (te(value)) return t(value)
  return value
}

function fieldLabel(field: DescriptorFormField): string {
  if (props.resolveLabel) return props.resolveLabel(field)
  return translateMaybe(field.label, field.key)
}

function fieldHint(field: DescriptorFormField): string {
  if (props.resolveHint) return props.resolveHint(field)
  return translateMaybe(field.description)
}

function fieldPlaceholder(field: DescriptorFormField): string {
  if (props.resolvePlaceholder) return props.resolvePlaceholder(field)
  return translateMaybe(field.placeholder)
}

function optionLabel(field: DescriptorFormField, option: {label?: string; value: string}): string {
  if (props.resolveOptionLabel) return props.resolveOptionLabel(field, option)
  return translateMaybe(option.label, option.value)
}

const visibleFields = computed(() => filterVisibleDescriptorFields(props.fields, form.value))

function isSecretField(field: DescriptorFormField): boolean {
  return field.type === 'password' || field.binding === 'secret' || field.binding === 'password'
}

function isHttpEndpointField(field: DescriptorFormField): boolean {
  return field.binding === 'http_endpoint'
}

function selectOptions(field: DescriptorFormField) {
  return (field.options || []).map((option) => ({
    value: option.value,
    label: optionLabel(field, option),
  }))
}

function readValue(field: DescriptorFormField): string {
  return readDescriptorFieldValue(form.value, field, writeOpts.value)
}

function booleanModel(field: DescriptorFormField): boolean {
  const raw = readValue(field).trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes'
}

function isFieldRequired(field: DescriptorFormField): boolean {
  return isDescriptorFieldRequired(field, collectFieldValues(form.value))
}

function fieldError(field: DescriptorFormField): string {
  const binding = field.binding || ''
  if ((binding === 'host' || binding === 'kafka_bootstrap') && props.hostError) {
    return props.hostError
  }
  if (binding === 'http_endpoint' && props.endpointError) return props.endpointError
  return ''
}

function isWide(field: DescriptorFormField): boolean {
  return (
    field.type === 'textarea'
    || field.type === 'select'
    || field.type === 'boolean'
    || field.binding === 'database'
    || field.binding === 'url'
    || field.binding === 'sid'
    || field.binding === 'auth'
    || field.binding === 'kafka_bootstrap'
    || field.binding === 'kudu_masters'
    || field.binding === 'http_endpoint'
    || field.binding === 'kafka_skip_tls'
    || field.binding === 'es_kibana'
    || field.binding === 'sshPrivateKey'
    || field.binding === 'jumpPrivateKey'
    || field.binding === 'sshEnabled'
  )
}

function onUpdate(field: DescriptorFormField, value: string) {
  if (field.readonly || props.readOnly) return
  writeDescriptorFieldValue(form.value, field, value, writeOpts.value)
}

function onHttpFocus() {
  httpFocused.value = true
}

function onHttpBlur(field: DescriptorFormField) {
  httpFocused.value = false
  if (props.readOnly || field.readonly) {
    syncHttpDraftFromForm()
    return
  }
  writeHttpEndpointDisplay(form.value, httpDraft.value)
  syncHttpDraftFromForm()
}

function onHttpPaste(field: DescriptorFormField, event: ClipboardEvent) {
  if (props.readOnly || field.readonly) return
  const text = event.clipboardData?.getData('text')?.trim()
  if (!text) return
  event.preventDefault()
  httpDraft.value = text
  writeHttpEndpointDisplay(form.value, text)
  syncHttpDraftFromForm()
}

function isMonoTextarea(field: DescriptorFormField): boolean {
  return (
    field.type === 'textarea'
    || field.binding === 'sshPrivateKey'
    || field.binding === 'jumpPrivateKey'
  )
}
</script>

<template>
  <template v-for="field in visibleFields" :key="field.key">
    <ConnectionFormField
        :wide="isWide(field)"
        :label="fieldLabel(field)"
        :hint="fieldHint(field)"
        :error="fieldError(field)"
        :required="isFieldRequired(field)"
    >
      <DwSecretInput
          v-if="isSecretField(field) && field.type !== 'textarea'"
          :model-value="readValue(field)"
          variant="sm"
          :disabled="readOnly || field.readonly"
          :placeholder="fieldPlaceholder(field)"
          :show-label="t('connection.showPassword')"
          :hide-label="t('connection.hidePassword')"
          @update:model-value="onUpdate(field, $event)"
      />
      <textarea
          v-else-if="isMonoTextarea(field)"
          class="descriptor-conn-fields__textarea"
          :value="readValue(field)"
          :disabled="readOnly || field.readonly"
          :placeholder="fieldPlaceholder(field)"
          rows="4"
          spellcheck="false"
          @input="onUpdate(field, ($event.target as HTMLTextAreaElement).value)"
      />
      <DwSelect
          v-else-if="field.type === 'select' && selectOptions(field).length"
          :model-value="readValue(field)"
          :options="selectOptions(field)"
          size="sm"
          :disabled="readOnly || field.readonly"
          :placeholder="fieldPlaceholder(field) || fieldLabel(field)"
          :clearable="false"
          @update:model-value="onUpdate(field, String($event ?? ''))"
      />
      <DwCheckbox
          v-else-if="field.type === 'boolean'"
          :model-value="booleanModel(field)"
          :disabled="readOnly || field.readonly"
          @update:model-value="onUpdate(field, $event ? 'true' : 'false')"
      />
      <DwInput
          v-else-if="isHttpEndpointField(field)"
          v-model="httpDraft"
          variant="sm"
          :disabled="readOnly || field.readonly"
          :placeholder="fieldPlaceholder(field)"
          :aria-invalid="Boolean(fieldError(field))"
          @focus="onHttpFocus"
          @blur="onHttpBlur(field)"
          @paste="onHttpPaste(field, $event)"
      />
      <DwInput
          v-else
          :model-value="readValue(field)"
          variant="sm"
          :class="{ 'descriptor-conn-fields__url': field.binding === 'url' }"
          :type="field.type === 'number' ? 'number' : 'text'"
          :disabled="readOnly || field.readonly"
          :readonly="field.readonly"
          :placeholder="fieldPlaceholder(field)"
          :aria-invalid="Boolean(fieldError(field))"
          @update:model-value="onUpdate(field, String($event ?? ''))"
      />
    </ConnectionFormField>
  </template>
</template>

<style scoped>
.descriptor-conn-fields__url {
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
}

.descriptor-conn-fields__textarea {
  width: 100%;
  min-height: 88px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-radius-sm, 6px);
  background: var(--dw-surface);
  color: var(--dw-text);
  font: inherit;
  font-family: var(--dw-mono, ui-monospace, monospace);
  font-size: var(--dw-text-sm);
  padding: 8px 10px;
}

.descriptor-conn-fields__textarea:disabled {
  opacity: 0.65;
}
</style>

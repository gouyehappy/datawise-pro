<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwCheckbox, DwIcon, DwInput, DwSecretInput, DwSelect} from '@/core/components'
import ConnectionFormField from '@/features/connection/components/ConnectionFormField.vue'
import {
  createHttpCommunityPluginsApi,
  type CommunityPluginFormField,
  type CommunityPluginInfo,
} from '@/shared/api/http/community-plugins'
import {
  communityPluginContributionDescription,
  communityPluginFieldDescription,
  communityPluginFieldLabel,
  communityPluginFieldOptionLabel,
  communityPluginFieldPlaceholder,
  resolveCommunityPluginLocalization,
  scopedCommunityPluginLocalization,
} from '@/features/community-plugin/lib/community-plugin-locale'
import {readDatawiseHost} from '@/features/layout/services/desktop-bridge'
import type {ConnectionConfig} from '@/core/types'
import {validateJumpHostsText} from '@/features/connection/utils/ssh-jump-hosts'

const form = defineModel<ConnectionConfig>('form', {required: true})

const props = defineProps<{
  readOnly?: boolean
}>()

const {t, locale} = useI18n()
const api = createHttpCommunityPluginsApi()
const loading = ref(false)
const loadError = ref('')
const pluginInfo = ref<CommunityPluginInfo | null>(null)
const defaultsApplied = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const pendingPickerField = ref<PluginField | null>(null)

type FieldCondition =
  | {field: string; one_of: Array<string | boolean | number>}
  | {all_of: FieldCondition[]}
  | {any_of: FieldCondition[]}

type PluginField = CommunityPluginFormField & {
  options?: Array<{label?: string; value: string}>
  visible_when?: FieldCondition
  required_when?: FieldCondition
  picker?: {kind?: string; accept?: string[]; content_field?: string}
  /** Sidecar method that returns `{options}` for this select; opaque to the host. */
  options_action?: string
}

type PluginAction = {
  id: string
  label?: string
  description?: string
  variant?: string
  requires_valid_form?: boolean
  timeout_ms?: number
}

const provider = computed(() => {
  const pluginId = form.value.pluginId
  const providerId = form.value.pluginConnectionProvider
  if (!pluginId || !providerId || !pluginInfo.value) return null
  const contributions = (pluginInfo.value.manifest.contributions || []) as Array<{
    type?: string
    id?: string
    label?: string
    description?: string
    fields?: PluginField[]
    actions?: PluginAction[]
  }>
  return contributions.find((c) => c.type === 'connection-provider' && c.id === providerId) || null
})

/** Manifest-declared connection form actions (labels live in the manifest, not host i18n). */
const providerActions = computed<PluginAction[]>(() => {
  const actions = (provider.value as {actions?: PluginAction[]} | null)?.actions || []
  return actions.filter((action) => action && typeof action.id === 'string' && action.id.trim())
})

// hostApi 1.3 manifest localizations — display copy resolved per UI locale with
// English (manifest base) fallback.
const providerScopedLocalization = computed(() =>
  scopedCommunityPluginLocalization(
    pluginInfo.value ? resolveCommunityPluginLocalization(pluginInfo.value.manifest, locale.value) : null,
    provider.value?.id,
  ),
)

function scopedFieldStrings(field: PluginField) {
  return providerScopedLocalization.value?.fields?.[field.key]
}

function actionStrings(action: PluginAction) {
  return providerScopedLocalization.value?.actions?.[action.id]
}

const providerDescription = computed(() => {
  if (!provider.value) return ''
  return communityPluginContributionDescription(provider.value, providerScopedLocalization.value)
})

const allFields = computed(() => (provider.value?.fields || []) as PluginField[])

/** Plugin advanced settings are stored as JSON so multiline secrets (kubeconfig YAML) survive. */
function readPluginAdvanced(): Record<string, string> {
  const raw = form.value.advancedConfig?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value == null) continue
        out[key] = typeof value === 'string' ? value : String(value)
      }
      return out
    }
  } catch {
    // migrate legacy key=value lines
  }
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

function writePluginAdvanced(next: Record<string, string>) {
  form.value.advancedConfig = JSON.stringify(next)
}

/** Secret-bound values live in the dedicated `secrets` slot (encrypted at rest). */
function readPluginSecrets(): Record<string, string> {
  const raw = form.value.secrets?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value == null) continue
        out[key] = typeof value === 'string' ? value : String(value)
      }
      return out
    }
  } catch {
    // corrupt payload — start clean
  }
  return {}
}

function writePluginSecrets(next: Record<string, string>) {
  // Always a JSON string (never undefined): an all-empty secret form must still
  // reach the backend so applyDto overwrites stale stored secrets. undefined
  // would be dropped from the payload and keep the old values alive.
  form.value.secrets = JSON.stringify(next)
}

function fieldValues(): Record<string, string> {
  return {
    ...readPluginAdvanced(),
    ...readPluginSecrets(),
    host: form.value.host || '',
    port: form.value.port || '',
    user: form.value.user || '',
    password: form.value.password || '',
    database: form.value.database || '',
    name: form.value.name || '',
  }
}

function evalCondition(condition: FieldCondition | undefined, values: Record<string, string>): boolean {
  if (!condition) return true
  if ('all_of' in condition) {
    return (condition.all_of || []).every((item) => evalCondition(item, values))
  }
  if ('any_of' in condition) {
    return (condition.any_of || []).some((item) => evalCondition(item, values))
  }
  if ('field' in condition && Array.isArray(condition.one_of)) {
    const current = String(values[condition.field] ?? '')
    return condition.one_of.map((item) => String(item)).includes(current)
  }
  return true
}

const visibleFields = computed(() => {
  const values = fieldValues()
  void form.value.advancedConfig
  void form.value.host
  void form.value.port
  void form.value.user
  void form.value.password
  void form.value.name
  // Host already owns the connection name row — skip duplicate binding:name fields.
  return allFields.value.filter((field) => {
    if ((field.binding || 'config') === 'name') return false
    return evalCondition(field.visible_when, values)
  })
})

function usesPasswordSlot(field: PluginField): boolean {
  return field.binding === 'password' || (field.binding === 'secret' && field.key === 'password')
}

/** Mirror of the host-side classification: secret channel, not plaintext advancedConfig. */
function usesSecretSlot(field: PluginField): boolean {
  if (usesPasswordSlot(field)) return false
  const binding = field.binding || 'config'
  return binding === 'secret' || field.type === 'password'
}

function readFieldValue(field: PluginField): string {
  const binding = field.binding || 'config'
  if (binding === 'name') return form.value.name || ''
  if (binding === 'host') return form.value.host || ''
  if (binding === 'port') return form.value.port || ''
  if (binding === 'username' || binding === 'user') return form.value.user || ''
  if (usesPasswordSlot(field)) return form.value.password || ''
  if (binding === 'database') return form.value.database || ''
  if (usesSecretSlot(field)) return readPluginSecrets()[field.key] || ''
  return readPluginAdvanced()[field.key] || ''
}

function writeFieldValue(field: PluginField, value: string) {
  const binding = field.binding || 'config'
  if (binding === 'name') {
    form.value.name = value
    return
  }
  if (binding === 'host') {
    form.value.host = value
    return
  }
  if (binding === 'port') {
    form.value.port = value
    return
  }
  if (binding === 'username' || binding === 'user') {
    form.value.user = value
    return
  }
  if (usesPasswordSlot(field)) {
    form.value.password = value
    return
  }
  if (binding === 'database') {
    form.value.database = value
    return
  }
  if (usesSecretSlot(field)) {
    const next = readPluginSecrets()
    if (value === '') delete next[field.key]
    else next[field.key] = value
    writePluginSecrets(next)
    return
  }
  const next = readPluginAdvanced()
  if (value === '') delete next[field.key]
  else next[field.key] = value
  writePluginAdvanced(next)
}

/** Saved before the `secrets` slot existed? Move secret-bound values out of advancedConfig. */
function migrateLegacySecretFields() {
  const advanced = readPluginAdvanced()
  let secrets = readPluginSecrets()
  let changed = false
  for (const field of allFields.value) {
    if (!usesSecretSlot(field)) continue
    if (advanced[field.key] == null) continue
    secrets[field.key] = advanced[field.key]
    delete advanced[field.key]
    changed = true
  }
  if (changed) {
    writePluginSecrets(secrets)
    writePluginAdvanced(advanced)
  }
}

function writeAdvancedKey(key: string, value: string) {
  const next = readPluginAdvanced()
  if (value === '') delete next[key]
  else next[key] = value
  writePluginAdvanced(next)
}

function applyFieldDefaults() {
  if (defaultsApplied.value) return
  for (const field of allFields.value) {
    if (field.default == null || field.default === '') continue
    if (readFieldValue(field)) continue
    writeFieldValue(field, String(field.default))
  }
  defaultsApplied.value = true
}

function fieldLabel(field: PluginField) {
  return communityPluginFieldLabel(field, scopedFieldStrings(field))
}

function fieldHint(field: PluginField) {
  return communityPluginFieldDescription(field, scopedFieldStrings(field))
}

function fieldPlaceholder(field: PluginField) {
  return communityPluginFieldPlaceholder(field, scopedFieldStrings(field))
}

/** Per-field validation messages (currently SSH jump_hosts JSON). */
const fieldErrors = ref<Record<string, string>>({})

function clearFieldError(key: string) {
  if (!fieldErrors.value[key]) return
  const next = {...fieldErrors.value}
  delete next[key]
  fieldErrors.value = next
}

function validateJumpHostsField(value: string) {
  const result = validateJumpHostsText(value)
  if (result.ok) {
    clearFieldError('jump_hosts')
    return
  }
  fieldErrors.value = {
    ...fieldErrors.value,
    jump_hosts: t('communityPlugin.connection.jumpHostsInvalid', {error: result.error}),
  }
}

function onConfigFieldInput(field: PluginField, value: string) {
  writeFieldValue(field, value)
  if (field.key === 'jump_hosts') validateJumpHostsField(value)
}

function fieldError(field: PluginField): string {
  return fieldErrors.value[field.key] || ''
}

function isJumpHostsField(field: PluginField): boolean {
  return field.key === 'jump_hosts' && field.type === 'textarea'
}

function isFieldRequired(field: PluginField): boolean {
  const values = fieldValues()
  if (field.required_when) return evalCondition(field.required_when as FieldCondition, values)
  return Boolean(field.required)
}

function isSecretField(field: PluginField) {
  return field.type === 'password' || field.binding === 'secret' || field.binding === 'password'
}

function selectOptions(field: PluginField) {
  const source = field.options_action
    ? (dynamicOptions.value[field.key] || field.options || [])
    : (field.options || [])
  return source.map((option) => ({
    value: option.value,
    label: communityPluginFieldOptionLabel(option, scopedFieldStrings(field)),
  }))
}

/**
 * `options_action` contract: the host invokes the declared sidecar method with
 * `{field, values}` and expects `{options: [{label, value}]}`. On failure the
 * field falls back to static options, or to a plain text input.
 */
const dynamicOptions = ref<Record<string, Array<{label?: string; value: string}>>>({})
const dynamicOptionsFailed = ref<Record<string, boolean>>({})

async function loadDynamicOptions() {
  const pluginId = form.value.pluginId?.trim()
  if (!pluginId) return
  const next: Record<string, Array<{label?: string; value: string}>> = {}
  const failed: Record<string, boolean> = {}
  for (const field of allFields.value) {
    if (!field.options_action || field.type !== 'select') continue
    try {
      const result = (await api.invoke(pluginId, field.options_action, {
        field: field.key,
        values: fieldValues(),
      })) as {options?: Array<{label?: string; value: string}>} | null
      next[field.key] = Array.isArray(result?.options) ? result.options.filter((o) => o && 'value' in o) : []
    } catch {
      failed[field.key] = true
    }
  }
  dynamicOptions.value = next
  dynamicOptionsFailed.value = failed
}

const actionRunning = ref('')
const actionStatus = ref('')

/**
 * Connection action contract (hostApi ^1.1): result may carry a user-facing
 * `message` and `fieldValues` — a key→value map merged back into the form
 * according to each field's manifest binding.
 */
async function runProviderAction(action: PluginAction) {
  if (props.readOnly || actionRunning.value) return
  actionRunning.value = action.id
  actionStatus.value = ''
  try {
    const result = (await api.connectionAction(form.value, action.id, {
      values: fieldValues(),
    })) as {message?: string; fieldValues?: Record<string, unknown> | null} | null
    if (result?.fieldValues && typeof result.fieldValues === 'object') {
      for (const [key, value] of Object.entries(result.fieldValues)) {
        applyFieldValue(key, value == null ? '' : String(value))
      }
    }
    actionStatus.value = (result?.message || '').trim()
  } catch (e) {
    actionStatus.value = e instanceof Error ? e.message : String(e)
  } finally {
    actionRunning.value = ''
  }
}

function applyFieldValue(key: string, value: string) {
  const field = allFields.value.find((item) => item.key === key)
  if (field) {
    writeFieldValue(field, value)
  } else {
    writeAdvancedKey(key, value)
  }
}

// Multiline secrets (kubeconfig / private key / TOTP) render masked until revealed —
// storage is encrypted at rest; this only covers shoulder-surfing on the form.
const revealedSecretTextareas = ref<Record<string, boolean>>({})

function isSecretTextarea(field: PluginField): boolean {
  return field.type === 'textarea' && usesSecretSlot(field)
}

function toggleSecretTextarea(key: string) {
  revealedSecretTextareas.value = {...revealedSecretTextareas.value, [key]: !revealedSecretTextareas.value[key]}
}

function booleanModel(field: PluginField): boolean {
  const raw = readFieldValue(field).trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes'
}

function hasFilePicker(field: PluginField): boolean {
  return field.picker?.kind === 'file'
}

function pickerAccept(field: PluginField): string {
  const accept = field.picker?.accept
  if (!accept?.length) return ''
  return accept.join(',')
}

async function pickFile(field: PluginField) {
  if (props.readOnly) return
  const host = readDatawiseHost()
  const contentKey = field.picker?.content_field
  if (host?.fs?.selectFile) {
    const ext = field.picker?.accept?.[0]?.replace(/^\./, '') || undefined
    const path = await host.fs.selectFile(ext)
    if (!path) return
    writeFieldValue(field, path)
    if (contentKey && host.fs.readTextFile) {
      const read = await host.fs.readTextFile(path)
      if (read.ok && typeof read.content === 'string') {
        writeAdvancedKey(contentKey, read.content)
      }
    }
    return
  }
  pendingPickerField.value = field
  fileInput.value?.click()
}

async function onWebFileChosen(event: Event) {
  const field = pendingPickerField.value
  pendingPickerField.value = null
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!field || !file) return
  const contentKey = field.picker?.content_field
  if (contentKey) {
    const text = await file.text()
    writeAdvancedKey(contentKey, text)
    // Web builds cannot keep a durable local path; content is the credential.
    writeFieldValue(field, '')
  } else {
    writeFieldValue(field, file.name)
  }
}

async function loadProvider() {
  const pluginId = form.value.pluginId?.trim()
  if (!pluginId) {
    pluginInfo.value = null
    loadError.value = t('communityPlugin.connection.missingPlugin')
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    pluginInfo.value = await api.get(pluginId)
    migrateLegacySecretFields()
    applyFieldDefaults()
    void loadDynamicOptions()
  } catch (e) {
    pluginInfo.value = null
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

watch(
  () => [form.value.pluginId, form.value.pluginConnectionProvider] as const,
  () => {
    defaultsApplied.value = false
    fieldErrors.value = {}
    void loadProvider()
  },
  {immediate: true},
)

// Re-check jump_hosts when the advanced textarea becomes visible or its stored value changes.
watch(
  () => {
    const field = visibleFields.value.find((item) => item.key === 'jump_hosts')
    return field ? readFieldValue(field) : null
  },
  (value) => {
    if (value == null) {
      clearFieldError('jump_hosts')
      return
    }
    validateJumpHostsField(value)
  },
)
</script>

<template>
  <div class="plugin-conn-fields">
    <p v-if="providerDescription" class="plugin-conn-fields__intro">{{ providerDescription }}</p>

    <p v-if="loading" class="plugin-conn-fields__hint">{{ t('communityPlugin.connection.loading') }}</p>
    <p v-else-if="loadError" class="plugin-conn-fields__error">{{ loadError }}</p>
    <p v-else-if="!provider" class="plugin-conn-fields__hint">
      {{ t('communityPlugin.connection.providerMissing') }}
    </p>

    <template v-else>
      <input
          ref="fileInput"
          class="plugin-conn-fields__file-input"
          type="file"
          :accept="pendingPickerField ? pickerAccept(pendingPickerField) : undefined"
          @change="onWebFileChosen"
      />
      <ConnectionFormField
          v-for="field in visibleFields"
          :key="field.key"
          :wide="field.type === 'textarea' || field.type === 'select' || hasFilePicker(field)"
          :label="fieldLabel(field)"
          :hint="fieldHint(field)"
          :error="fieldError(field)"
          :required="isFieldRequired(field)"
      >
        <DwSecretInput
            v-if="isSecretField(field) && field.type !== 'textarea'"
            :model-value="readFieldValue(field)"
            variant="sm"
            :disabled="readOnly"
            :placeholder="fieldPlaceholder(field)"
            :show-label="t('connection.showPassword')"
            :hide-label="t('connection.hidePassword')"
            @update:model-value="writeFieldValue(field, $event)"
        />
        <div v-else-if="isSecretTextarea(field)" class="plugin-conn-fields__secret-textarea">
          <textarea
              v-if="revealedSecretTextareas[field.key] || !readFieldValue(field)"
              class="plugin-conn-fields__textarea"
              :value="readFieldValue(field)"
              :disabled="readOnly"
              :placeholder="fieldPlaceholder(field)"
              rows="6"
              spellcheck="false"
              @input="writeFieldValue(field, ($event.target as HTMLTextAreaElement).value)"
          />
          <div
              v-else
              class="plugin-conn-fields__textarea plugin-conn-fields__textarea--masked"
              :aria-label="t('communityPlugin.connection.secretHidden')"
          >
            <span aria-hidden="true">••••••••••••••••</span>
          </div>
          <button
              v-if="readFieldValue(field)"
              type="button"
              class="plugin-conn-fields__secret-toggle"
              :title="revealedSecretTextareas[field.key]
                ? t('communityPlugin.connection.hideSecret')
                : t('communityPlugin.connection.showSecret')"
              @click="toggleSecretTextarea(field.key)"
          >
            <DwIcon
                :name="revealedSecretTextareas[field.key] ? 'visibility-off' : 'visibility'"
                size="sm"
                :stroke-width="1.75"
            />
          </button>
        </div>
        <textarea
            v-else-if="field.type === 'textarea'"
            class="plugin-conn-fields__textarea"
            :class="{ 'plugin-conn-fields__textarea--invalid': !!fieldError(field) }"
            :value="readFieldValue(field)"
            :disabled="readOnly"
            :placeholder="fieldPlaceholder(field)"
            rows="6"
            spellcheck="false"
            @input="isJumpHostsField(field)
              ? onConfigFieldInput(field, ($event.target as HTMLTextAreaElement).value)
              : writeFieldValue(field, ($event.target as HTMLTextAreaElement).value)"
            @blur="isJumpHostsField(field) && validateJumpHostsField(readFieldValue(field))"
        />
        <DwSelect
            v-else-if="field.type === 'select' && selectOptions(field).length"
            :model-value="readFieldValue(field)"
            :options="selectOptions(field)"
            size="sm"
            :disabled="readOnly"
            :placeholder="fieldPlaceholder(field) || fieldLabel(field)"
            :clearable="false"
            @update:model-value="writeFieldValue(field, String($event ?? ''))"
        />
        <DwCheckbox
            v-else-if="field.type === 'boolean'"
            :model-value="booleanModel(field)"
            :disabled="readOnly"
            @update:model-value="writeFieldValue(field, $event ? 'true' : 'false')"
        />
        <div v-else-if="hasFilePicker(field)" class="plugin-conn-fields__picker">
          <DwInput
              :model-value="readFieldValue(field)"
              variant="sm"
              :disabled="readOnly"
              :placeholder="fieldPlaceholder(field)"
              @update:model-value="writeFieldValue(field, String($event ?? ''))"
          />
          <DwButton
              variant="secondary"
              size="sm"
              :disabled="readOnly"
              @click="pickFile(field)"
          >
            {{ t('communityPlugin.connection.chooseFile') }}
          </DwButton>
        </div>
        <DwInput
            v-else
            :model-value="readFieldValue(field)"
            variant="sm"
            :type="field.type === 'number' ? 'number' : 'text'"
            :disabled="readOnly"
            :placeholder="fieldPlaceholder(field)"
            @update:model-value="writeFieldValue(field, String($event ?? ''))"
        />
      </ConnectionFormField>
      </template>

      <div v-if="providerActions.length && !readOnly" class="plugin-conn-fields__actions">
        <DwButton
            v-for="action in providerActions"
            :key="action.id"
            :variant="action.variant === 'primary' ? 'primary' : 'secondary'"
            size="sm"
            :disabled="actionRunning !== ''"
            :title="actionStrings(action)?.description || action.description"
            @click="runProviderAction(action)"
        >
          {{ actionStrings(action)?.label || action.label || action.id }}
        </DwButton>
      </div>
      <p
          v-if="actionStatus"
          class="plugin-conn-fields__hint plugin-conn-fields__action-status"
      >{{ actionStatus }}</p>
  </div>
</template>

<style scoped>
.plugin-conn-fields {
  display: contents;
}

.plugin-conn-fields__intro,
.plugin-conn-fields__hint,
.plugin-conn-fields__error {
  grid-column: 1 / -1;
  margin: 0;
  font-size: var(--dw-text-sm);
}

.plugin-conn-fields__intro,
.plugin-conn-fields__hint {
  color: var(--dw-text-muted);
}

.plugin-conn-fields__error {
  color: var(--dw-danger);
}

.plugin-conn-fields__file-input {
  display: none;
}

.plugin-conn-fields__picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.plugin-conn-fields__actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.plugin-conn-fields__action-status {
  white-space: pre-wrap;
}

.plugin-conn-fields__picker :deep(.dw-input),
.plugin-conn-fields__picker > :first-child {
  flex: 1 1 12rem;
  min-width: 0;
}

.plugin-conn-fields__textarea {
  width: 100%;
  min-height: 7.5rem;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-radius-sm, 6px);
  background: var(--dw-surface);
  color: var(--dw-text);
  font: inherit;
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  font-size: var(--dw-text-sm);
  padding: 8px 10px;
}

.plugin-conn-fields__textarea:disabled {
  opacity: 0.65;
}

.plugin-conn-fields__textarea--invalid {
  border-color: var(--dw-danger, #c62828);
}

.plugin-conn-fields__secret-textarea {
  position: relative;
  width: 100%;
  min-width: 0;
}

.plugin-conn-fields__textarea--masked {
  display: flex;
  align-items: center;
  min-height: 2.75rem;
  color: var(--dw-text-muted);
  letter-spacing: 2px;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
}

.plugin-conn-fields__secret-toggle {
  position: absolute;
  top: 6px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--dw-radius-sm, 6px);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
}

.plugin-conn-fields__secret-toggle:hover {
  background: var(--dw-surface-muted, color-mix(in srgb, var(--dw-text) 6%, transparent));
  color: var(--dw-text);
}
</style>

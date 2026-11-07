<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwInlineAlert, DwInput, EmptyState} from '@/core/components'
import AppModal from '@/core/components/AppModal.vue'
import ModalActions from '@/core/components/ModalActions.vue'
import {explorerApi} from '@/api'
import type {ConnectionConfig} from '@/core/types'
import type {NacosNamespaceSummary} from '@/features/explorer/services/nacos-configs.service'
import {
  formatVisibleNacosNamespaces,
  readVisibleNacosNamespaces,
} from '@/features/connection/utils/nacos-endpoint'
import {isUnsavedConnectionId} from '@/features/connection/utils/connection-defaults'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const open = defineModel<boolean>('open', {default: false})

const props = defineProps<{
  form: ConnectionConfig
}>()

const emit = defineEmits<{
  save: [ids: string[] | null]
}>()

type NamespaceRow = {id: string; label: string}

const {t} = useI18n()
const mode = ref<'auto' | 'manual'>('auto')
const query = ref('')
const showSelectedOnly = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const rows = ref<NamespaceRow[]>([])
const selected = ref<string[]>([])
const manualText = ref('')

const subtitle = computed(() => t('connection.nacosNamespaceDetectHint', {
  name: props.form.name?.trim() || t('connection.nacosImplementationNacos'),
}))

const filteredRows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return rows.value.filter((row) => {
    if (showSelectedOnly.value && !selected.value.includes(row.id)) return false
    if (!q) return true
    return row.label.toLowerCase().includes(q) || row.id.toLowerCase().includes(q)
  })
})

const selectedCount = computed(() => selected.value.length)

function includesId(id: string) {
  return selected.value.includes(id)
}

function toggle(id: string) {
  selected.value = includesId(id)
      ? selected.value.filter((item) => item !== id)
      : [...selected.value, id]
}

function selectAllVisible() {
  const ids = new Set(selected.value)
  for (const row of filteredRows.value) ids.add(row.id)
  selected.value = [...ids]
}

function clearSelection() {
  const hidden = new Set(filteredRows.value.map((row) => row.id))
  selected.value = selected.value.filter((id) => !hidden.has(id))
}

function syncManualText() {
  manualText.value = selected.value.length
      ? formatVisibleNacosNamespaces(selected.value).split('|').join('\n')
      : ''
}

function applyManualText() {
  selected.value = manualText.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (line === 'public' ? '' : line))
}

watch(mode, (next, prev) => {
  if (next === 'manual' && prev === 'auto') syncManualText()
  if (next === 'auto' && prev === 'manual') applyManualText()
})

watch(open, (value) => {
  if (!value) return
  mode.value = 'auto'
  query.value = ''
  showSelectedOnly.value = false
  error.value = null
  const saved = readVisibleNacosNamespaces(props.form.advancedConfig)
  selected.value = saved ? [...saved] : []
  void detect()
})

function normalizeRows(namespaces: NacosNamespaceSummary[]): NamespaceRow[] {
  const items: NamespaceRow[] = [{id: '', label: 'public'}]
  const seen = new Set<string>([''])
  for (const item of namespaces) {
    const id = (item.namespace ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const label = (item.namespaceShowName ?? '').trim() || id
    items.push({id, label})
  }
  return items
}

async function detect() {
  loading.value = true
  error.value = null
  try {
    const savedId = props.form.id
    const useSaved = savedId && !isUnsavedConnectionId(savedId) && !props.form.password
    const result = useSaved
        ? await explorerApi.fetchNacosNamespaces(savedId)
        : await explorerApi.detectNacosNamespaces(props.form)
    rows.value = normalizeRows(result.namespaces ?? [])
    const saved = readVisibleNacosNamespaces(props.form.advancedConfig)
    selected.value = saved ?? rows.value.map((row) => row.id)
  } catch (err) {
    rows.value = [{id: '', label: 'public'}]
    error.value = resolveCaughtApiErrorMessage(err, t, 'connection.nacosNamespaceDetectFailed')
  } finally {
    loading.value = false
  }
}

function onSave() {
  if (mode.value === 'manual') applyManualText()
  const ids = [...new Set(selected.value)]
  const allSelected = mode.value === 'auto'
      && rows.value.length > 0
      && rows.value.every((row) => ids.includes(row.id))
  emit('save', allSelected ? null : ids)
  open.value = false
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('connection.nacosNamespaceDetectTitle')"
      :subtitle="subtitle"
      width="560px"
      @close="open = false"
  >
    <div class="ns-picker">
      <div class="ns-picker__modes" role="tablist">
        <button type="button" :class="{ 'is-active': mode === 'auto' }" @click="mode = 'auto'">
          {{ t('connection.nacosNamespaceAuto') }}
        </button>
        <button type="button" :class="{ 'is-active': mode === 'manual' }" @click="mode = 'manual'">
          {{ t('connection.nacosNamespaceManual') }}
        </button>
      </div>

      <template v-if="mode === 'auto'">
        <DwInput
            v-model="query"
            variant="sm"
            :placeholder="t('connection.nacosNamespaceSearch')"
        />
        <div class="ns-picker__meta">
          <span>{{ t('connection.nacosNamespaceSelected', { count: selectedCount, total: rows.length }) }}</span>
          <span class="ns-picker__links">
            <button type="button" @click="selectAllVisible">{{ t('connection.nacosNamespaceSelectAll') }}</button>
            <button type="button" @click="clearSelection">{{ t('connection.nacosNamespaceClear') }}</button>
            <button type="button" @click="showSelectedOnly = !showSelectedOnly">
              {{ showSelectedOnly ? t('connection.nacosNamespaceShowAll') : t('connection.nacosNamespaceShowSelected') }}
            </button>
          </span>
        </div>
        <DwInlineAlert v-if="error" variant="error">{{ error }}</DwInlineAlert>
        <p v-else-if="loading" class="ns-picker__status">{{ t('connection.nacosNamespaceDetecting') }}</p>
        <ul v-else-if="filteredRows.length" class="ns-picker__list">
          <li v-for="row in filteredRows" :key="row.id || 'public'">
            <label>
              <input type="checkbox" :checked="includesId(row.id)" @change="toggle(row.id)">
              <span class="ns-picker__name">{{ row.label }}</span>
              <span v-if="row.id && row.id !== row.label" class="ns-picker__id">{{ row.id }}</span>
            </label>
          </li>
        </ul>
        <EmptyState
            v-else
            embedded
            compact
            class="ns-picker__empty"
            :title="t('connection.nacosNamespaceEmpty')"
        />
      </template>

      <DwInput
          v-else
          v-model="manualText"
          variant="mono"
          :rows="8"
          :placeholder="t('connection.nacosNamespaceManualPlaceholder')"
      />
    </div>

    <template #footer>
      <ModalActions
          :confirm-label="t('common.save')"
          :confirm-disabled="loading"
          @cancel="open = false"
          @confirm="onSave"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.ns-picker {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
}

.ns-picker__modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-input-radius);
  background: var(--dw-bg-muted);
}

.ns-picker__modes button {
  height: var(--dw-density-sm);
  border-radius: calc(var(--dw-input-radius) - 2px);
  color: var(--dw-text-secondary);
}

.ns-picker__modes button.is-active {
  background: var(--dw-bg-panel);
  color: var(--dw-text);
  box-shadow: var(--dw-shadow-sm);
}

.ns-picker__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-3);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
}

.ns-picker__links {
  display: flex;
  gap: var(--dw-space-3);
}

.ns-picker__links button {
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
}

.ns-picker__links button:hover {
  color: var(--dw-text);
  box-shadow: none;
}

.ns-picker__list {
  margin: 0;
  padding: 2px 0;
  list-style: none;
  max-height: min(360px, 46vh);
  overflow: auto;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-input-radius);
}

.ns-picker__list label {
  display: flex;
  align-items: center;
  gap: var(--dw-space-3);
  padding: 7px 12px;
  cursor: pointer;
}

.ns-picker__list label:hover {
  background: var(--dw-bg-hover);
}

.ns-picker__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ns-picker__id {
  margin-left: auto;
  color: var(--dw-text-muted);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
}

.ns-picker__status {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.ns-picker__empty {
  padding: var(--dw-space-4) 0;
}
</style>

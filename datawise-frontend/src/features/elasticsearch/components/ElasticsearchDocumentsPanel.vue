<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {ConfirmDialog, DwCodeViewer, DwInlineAlert, DwSplitPane, EmptyState, IconButton, SettingsSelect} from '@/core/components'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {DwIcon} from '@/core/icons'
import {explorerApi} from '@/api'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {
    confirmDiscardConfigEdits,
    isConfigContentDirty,
} from '@/features/workspace/components/shared/config-content-edit'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{
    connectionId: string
    indexName?: string
}>()

const emit = defineEmits<{
    'update:indexName': [value: string]
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const {
    open: deleteConfirmOpen,
    title: deleteConfirmTitle,
    message: deleteConfirmMessage,
    confirmLabel: deleteConfirmLabel,
    confirmVariant: deleteConfirmVariant,
    confirmLoading: deleteConfirmLoading,
    ask: askDeleteConfirm,
    onConfirm: onDeleteConfirm,
    onOpenUpdate: onDeleteOpenUpdate,
} = useConfirmDialog('danger')

const indicesLoading = ref(false)
const indicesError = ref<string | null>(null)
const indices = ref<Array<{name: string; aliases: string[]}>>([])
const indexName = ref(props.indexName ?? '')

const filterDraft = ref('')
const appliedFilter = ref<string | undefined>(undefined)

const docsLoading = ref(false)
const docsError = ref<string | null>(null)
const rows = ref<Array<Record<string, unknown>>>([])
const columns = ref<Array<{key: string; name: string}>>([])
const offset = ref(0)
const pageSize = 50
const hasMore = ref(false)
const totalCount = ref<number | null>(null)
const selectedRowIndex = ref(-1)
const jsonDraft = ref('')
const baselineJson = ref('')
const docIdDraft = ref('')
const editing = ref(false)
const saving = ref(false)

const indexOptions = computed(() =>
    indices.value.map((item) => ({
        value: item.name,
        label: item.aliases.length ? `${item.name} · ${item.aliases.join(', ')}` : item.name,
    })),
)

const selectedRow = computed(() =>
    selectedRowIndex.value >= 0 ? rows.value[selectedRowIndex.value] ?? null : null,
)

function columnKey(name: string): string | undefined {
    return columns.value.find((column) => column.name === name)?.key
}

const selectedDocId = computed(() => {
    const row = selectedRow.value
    if (!row) return docIdDraft.value.trim()
    const idCol = columnKey('_id')
    if (idCol && row[idCol] != null) return String(row[idCol])
    return String(row._id ?? '')
})

const isDirty = computed(() =>
    isConfigContentDirty(editing.value, baselineJson.value, jsonDraft.value),
)

const statusText = computed(() => {
    if (docsLoading.value) return t('explorer.elasticsearchDocuments.loading')
    if (!indexName.value) return t('explorer.elasticsearchDocuments.pickIndex')
    if (totalCount.value != null) {
        return t('explorer.elasticsearchDocuments.count', {count: totalCount.value})
    }
    return t('explorer.elasticsearchDocuments.statusLoaded', {count: rows.value.length})
})

const contentSubtitle = computed(() => {
    if (!indexName.value) return undefined
    return selectedDocId.value
        ? `${indexName.value} / ${selectedDocId.value}`
        : indexName.value
})

async function confirmLeave(): Promise<boolean> {
    const ok = await confirmDiscardConfigEdits(isDirty.value, t('common.codeViewer.discardConfirm'))
    if (ok) exitEdit()
    return ok
}

function exitEdit() {
    editing.value = false
    saving.value = false
    jsonDraft.value = baselineJson.value
}

function prettySource(raw: string): string {
    try {
        return JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
        return raw
    }
}

function syncJsonFromSelection() {
    const row = selectedRow.value
    if (!row) {
        jsonDraft.value = ''
        baselineJson.value = ''
        docIdDraft.value = ''
        editing.value = false
        return
    }
    const source = row._sourceJson
    const text = typeof source === 'string' && source.trim()
        ? prettySource(source)
        : prettySource(JSON.stringify(sourceObject(row)))
    jsonDraft.value = text
    baselineJson.value = text
    docIdDraft.value = selectedDocId.value
    editing.value = false
}

function sourceObject(row: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    for (const column of columns.value) {
        if (column.name === '_id' || column.name === '_score') continue
        payload[column.name] = row[column.key]
    }
    return payload
}

async function refreshIndices() {
    if (!props.connectionId) {
        indices.value = []
        return
    }
    indicesLoading.value = true
    indicesError.value = null
    try {
        const result = await explorerApi.fetchElasticsearchIndices(props.connectionId)
        indices.value = (result.indices ?? []).map((item) => ({
            name: item.name,
            aliases: item.aliases ?? [],
        }))
        if (!indexName.value && indices.value.length === 1) {
            indexName.value = indices.value[0].name
            emit('update:indexName', indexName.value)
            void loadDocuments()
        }
    } catch (error) {
        indices.value = []
        indicesError.value = resolveCaughtApiErrorMessage(
            error,
            t,
            'explorer.elasticsearchDocuments.loadIndicesFailed',
        )
    } finally {
        indicesLoading.value = false
    }
}

async function loadDocuments(options?: {append?: boolean}) {
    if (!props.connectionId || !indexName.value) {
        rows.value = []
        columns.value = []
        selectedRowIndex.value = -1
        syncJsonFromSelection()
        return
    }
    docsLoading.value = true
    docsError.value = null
    try {
        const nextOffset = options?.append ? offset.value + pageSize : 0
        const page = await explorerApi.fetchElasticsearchDocuments(props.connectionId, indexName.value, {
            offset: nextOffset,
            limit: pageSize,
            filter: appliedFilter.value,
        })
        columns.value = ((page.columns ?? []) as Array<{key?: string; name?: string}>)
            .filter((column) => column.key && column.name)
            .map((column) => ({key: String(column.key), name: String(column.name)}))
        const nextRows = (page.rows ?? []) as Array<Record<string, unknown>>
        rows.value = options?.append ? [...rows.value, ...nextRows] : nextRows
        offset.value = nextOffset
        hasMore.value = Boolean(page.hasMore)
        if (!options?.append) {
            selectedRowIndex.value = rows.value.length > 0 ? 0 : -1
            syncJsonFromSelection()
        }
        try {
            totalCount.value = await explorerApi.countElasticsearchDocuments(
                props.connectionId,
                indexName.value,
                {filter: appliedFilter.value},
            )
        } catch {
            totalCount.value = null
        }
    } catch (error) {
        if (!options?.append) {
            rows.value = []
            selectedRowIndex.value = -1
            syncJsonFromSelection()
        }
        docsError.value = resolveCaughtApiErrorMessage(
            error,
            t,
            'explorer.elasticsearchDocuments.loadDocsFailed',
        )
    } finally {
        docsLoading.value = false
    }
}

async function onIndexSelect(next: string) {
    if (next === indexName.value) return
    if (!(await confirmLeave())) return
    indexName.value = next
    emit('update:indexName', next)
    filterDraft.value = ''
    appliedFilter.value = undefined
    void loadDocuments()
}

async function selectDocument(index: number) {
    if (index === selectedRowIndex.value) return
    if (!(await confirmLeave())) return
    selectedRowIndex.value = index
    syncJsonFromSelection()
}

async function applyFilter() {
    if (!(await confirmLeave())) return
    const raw = filterDraft.value.trim()
    if (!raw) {
        appliedFilter.value = undefined
        void loadDocuments()
        return
    }
    try {
        const parsed = JSON.parse(raw)
        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            docsError.value = t('explorer.elasticsearchDocuments.filterMustBeObject')
            return
        }
        appliedFilter.value = JSON.stringify(parsed)
        filterDraft.value = JSON.stringify(parsed)
        void loadDocuments()
    } catch {
        docsError.value = t('explorer.elasticsearchDocuments.filterInvalidJson')
    }
}

function startEdit() {
    if (!indexName.value || docsLoading.value || saving.value) return
    if (!jsonDraft.value.trim()) jsonDraft.value = '{\n  \n}'
    baselineJson.value = jsonDraft.value
    editing.value = true
}

async function newDocument() {
    if (!indexName.value) return
    if (!(await confirmLeave())) return
    selectedRowIndex.value = -1
    docIdDraft.value = ''
    jsonDraft.value = '{\n  \n}'
    baselineJson.value = jsonDraft.value
    editing.value = true
}

async function cancelEdit() {
    if (saving.value) return
    if (!(await confirmLeave())) return
}

async function saveDocument() {
    if (!props.connectionId || !indexName.value || saving.value) return
    try {
        JSON.parse(jsonDraft.value)
    } catch {
        docsError.value = t('dataGrid.cellEditor.invalidJson')
        return
    }
    saving.value = true
    docsError.value = null
    try {
        const saved = await explorerApi.upsertElasticsearchDocument(props.connectionId, indexName.value, {
            id: docIdDraft.value.trim() || undefined,
            sourceJson: jsonDraft.value,
        })
        editing.value = false
        await loadDocuments()
        if (saved.id) {
            const idCol = columnKey('_id')
            const found = rows.value.findIndex((row) => idCol && String(row[idCol]) === saved.id)
            if (found >= 0) {
                selectedRowIndex.value = found
                syncJsonFromSelection()
            }
        }
    } catch (error) {
        docsError.value = resolveCaughtApiErrorMessage(
            error,
            t,
            'explorer.elasticsearchDocuments.saveFailed',
        )
    } finally {
        saving.value = false
    }
}

async function deleteSelected() {
    if (!props.connectionId || !indexName.value || !selectedDocId.value) return
    const confirmed = await askDeleteConfirm({
        title: t('common.confirm'),
        message: t('explorer.elasticsearchDocuments.confirmDelete', {id: selectedDocId.value}),
        confirmLabel: t('explorer.elasticsearchDocuments.delete'),
    })
    if (!confirmed) return
    deleteConfirmLoading.value = true
    saving.value = true
    docsError.value = null
    try {
        await explorerApi.deleteElasticsearchDocument(
            props.connectionId,
            indexName.value,
            selectedDocId.value,
        )
        editing.value = false
        await loadDocuments()
    } catch (error) {
        docsError.value = resolveCaughtApiErrorMessage(
            error,
            t,
            'explorer.elasticsearchDocuments.deleteFailed',
        )
    } finally {
        deleteConfirmLoading.value = false
        saving.value = false
    }
}

function refresh() {
    void refreshIndices()
    void loadDocuments()
}

defineExpose({refresh})

watch(
    () => props.connectionId,
    () => {
        void refreshIndices()
        void loadDocuments()
    },
)

watch(
    () => props.indexName,
    async (next) => {
        const value = next ?? ''
        if (value === indexName.value) return
        if (!(await confirmLeave())) return
        indexName.value = value
        void loadDocuments()
    },
)

onMounted(() => {
    void refreshIndices()
    if (indexName.value) void loadDocuments()
})
</script>

<template>
  <div class="connector-browse-panel connector-workbench-pane">
    <DwInlineAlert v-if="docsError || indicesError" density="banner" variant="error" :message="docsError || indicesError || ''"/>

    <DwSplitPane
        class="connector-browse-panel__body connector-browse-panel__body--split"
        storage-key="dw.split.es-documents"
        :default-width="320"
        :min-width="240"
        :max-width="560"
        :end-min-width="300"
        :stack-below="900"
        start-class="connector-browse-panel__pane"
        end-class="connector-browse-panel__pane connector-browse-panel__pane--flush"
    >
      <template #start>
        <div class="connector-list">
          <div class="connector-list__filters connector-list__filters--services">
            <SettingsSelect
                :model-value="indexName"
                size="sm"
                searchable
                :options="indexOptions"
                :disabled="indicesLoading"
                :placeholder="t('explorer.elasticsearchDocuments.pickIndex')"
                @update:model-value="onIndexSelect"
            />
            <input
                v-model="filterDraft"
                class="connector-list__filter"
                type="search"
                :placeholder="t('explorer.elasticsearchDocuments.filterPlaceholder')"
                autocomplete="off"
                spellcheck="false"
                @keydown.enter.prevent="applyFilter"
            >
            <button class="connector-list__refresh" type="button" :disabled="docsLoading" @click="applyFilter">
              {{ t('explorer.elasticsearchDocuments.refresh') }}
            </button>
          </div>
          <div class="connector-list__scroll">
            <table class="connector-browse-panel__table">
              <thead>
              <tr>
                <th>{{ t('explorer.elasticsearchDocuments.columns.id') }}</th>
                <th>{{ t('explorer.elasticsearchDocuments.columns.score') }}</th>
              </tr>
              </thead>
              <tbody>
              <tr v-if="!docsLoading && rows.length === 0">
                <td class="connector-list__empty" colspan="2">
                  <EmptyState
                      embedded
                      compact
                      :title="indexName
                        ? t('explorer.elasticsearchDocuments.noDocs')
                        : t('explorer.elasticsearchDocuments.pickIndexHint')"
                  />
                </td>
              </tr>
              <tr
                  v-for="(row, index) in rows"
                  :key="String(row[columnKey('_id') ?? '_id'] ?? index)"
                  class="is-clickable"
                  :class="{ 'is-selected': index === selectedRowIndex }"
                  @click="selectDocument(index)"
              >
                <td>{{ row[columnKey('_id') ?? '_id'] ?? '—' }}</td>
                <td>{{ row[columnKey('_score') ?? '_score'] ?? '—' }}</td>
              </tr>
              </tbody>
            </table>
          </div>
          <div class="connector-list__foot connector-list__foot--head">
            <span>{{ statusText }}</span>
            <button
                v-if="hasMore"
                class="connector-list__refresh"
                type="button"
                :disabled="docsLoading"
                @click="loadDocuments({append: true})"
            >
              {{ t('explorer.elasticsearchDocuments.loadMore') }}
            </button>
          </div>
        </div>
      </template>

      <template #end>
        <EmptyState
            v-if="!indexName"
            class="connector-editor-empty"
            embedded
            compact
            :title="t('explorer.elasticsearchDocuments.pickIndex')"
            :hint="t('explorer.elasticsearchDocuments.pickIndexHint')"
        />
        <DwCodeViewer
            v-else
            v-model:content="jsonDraft"
            :title="t('explorer.elasticsearchDocuments.contentTitle')"
            :subtitle="contentSubtitle"
            language="json"
            filename="document.json"
            :loading="docsLoading && rows.length === 0"
            :readonly="!editing"
            dark
            card
            :empty-text="t('explorer.elasticsearchDocuments.emptyContent')"
        >
          <template #actions>
            <input
                v-if="editing"
                v-model="docIdDraft"
                class="es-docs__id"
                :placeholder="t('explorer.elasticsearchDocuments.docId')"
                spellcheck="false"
            >
            <span v-if="editing && isDirty" class="es-docs__dirty">{{ t('common.codeViewer.dirty') }}</span>
            <IconButton
                v-if="!editing"
                size="sm"
                class="dw-code-viewer__icon-btn"
                :title="t('explorer.elasticsearchDocuments.newDoc')"
                :disabled="!indexName"
                @click="newDocument"
            >
              <DwIcon name="file" size="sm"/>
            </IconButton>
            <template v-if="!editing">
              <IconButton
                  size="sm"
                  class="dw-code-viewer__icon-btn"
                  :title="t('common.codeViewer.edit')"
                  :disabled="docsLoading"
                  @click="startEdit"
              >
                <DwIcon name="edit" size="sm"/>
              </IconButton>
              <IconButton
                  size="sm"
                  class="dw-code-viewer__icon-btn"
                  :title="t('explorer.elasticsearchDocuments.delete')"
                  :disabled="!selectedDocId || saving"
                  @click="deleteSelected"
              >
                <DwIcon name="delete" size="sm"/>
              </IconButton>
            </template>
            <template v-else>
              <IconButton
                  size="sm"
                  class="dw-code-viewer__icon-btn"
                  :title="saving ? t('common.codeViewer.saving') : t('common.codeViewer.save')"
                  :disabled="saving || !isDirty"
                  @click="saveDocument"
              >
                <DwIcon name="save" size="sm"/>
              </IconButton>
              <IconButton
                  size="sm"
                  class="dw-code-viewer__icon-btn"
                  :title="t('common.codeViewer.cancel')"
                  :disabled="saving"
                  @click="cancelEdit"
              >
                <DwIcon name="close" size="sm"/>
              </IconButton>
            </template>
          </template>
        </DwCodeViewer>
      </template>
    </DwSplitPane>

    <ConfirmDialog
        :open="deleteConfirmOpen"
        :title="deleteConfirmTitle"
        :message="deleteConfirmMessage"
        :confirm-label="deleteConfirmLabel"
        :confirm-loading="deleteConfirmLoading"
        :confirm-variant="deleteConfirmVariant"
        @update:open="onDeleteOpenUpdate"
        @confirm="onDeleteConfirm"
    />
  </div>
</template>

<style scoped>
.es-docs__id {
  width: 9rem;
  height: 1.5rem;
  margin-right: 0.25rem;
  padding: 0 0.4rem;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: inherit;
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
}

.es-docs__dirty {
  margin-right: 4px;
  font-size: var(--dw-text-xs);
  color: var(--dw-warning);
  white-space: nowrap;
}
</style>

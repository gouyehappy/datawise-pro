<script setup lang="ts">
import {computed, onMounted, ref, toRaw, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {createId} from '@/core/utils/id'
import {
    fetchAiKnowledgeEntries,
    saveAiKnowledgeEntries,
} from '@/features/ai/knowledge/services/ai-knowledge.service'
import {
    fetchAiRagStatus,
    rebuildAiRagIndex,
    type AiRagStatus,
} from '@/features/ai/rag/services/ai-rag.service'
import {
    createEmptyKnowledgeEntry,
    formatCommaList,
    parseCommaList,
    type AiKnowledgeEntry,
} from '@/features/ai/knowledge/types/ai-knowledge.types'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import type {AiRagPreferences, AiVectorStorePreference} from '@/shared/config/app-config.types'
import {DEFAULT_AI_RAG_PREFERENCES} from '@/shared/config/app-config.defaults'
import {
    DwButton,
    DwInlineAlert,
    DwInput,
    DwSelect,
    DwSecretInput,
    DwSplitPane,
    EmptyState,
    FormField,
} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {walkTree} from '@/core/utils/tree'
import {extractConnectionsFromTree} from '@/features/explorer/utils/tree-targets'

const props = withDefaults(defineProps<{
  view?: 'full' | 'glossary' | 'rag'
  embedded?: boolean
}>(), {
  view: 'full',
  embedded: false,
})

interface EditableRow {
    id: string
    term: string
    definition: string
    connectionId: string
    database: string
    synonyms: string
    relatedTables: string
}

const {t} = useI18n()
const layout = useLayoutStore()
const explorer = useExplorerStore()
const appConfig = useAppConfigStore()
const {readOnly, hint, denyIfReadOnly} = useResourceWriteGuard(UserResource.AiKnowledge)

const rows = ref<EditableRow[]>([])
const loading = ref(false)
const saving = ref(false)
const panelError = ref('')
const ragError = ref('')
const ragSaving = ref(false)
const ragStatus = ref<AiRagStatus | null>(null)
const ragLoading = ref(false)
const ragRebuilding = ref(false)
const ragScopeConnectionId = ref('')
const ragScopeDatabase = ref('')
const selectedEntryId = ref<string | null>(null)
const entryQuery = ref('')
const savedRowsSnapshot = ref('')
const ragDraft = ref<AiRagPreferences>({...DEFAULT_AI_RAG_PREFERENCES, pgvector: {...DEFAULT_AI_RAG_PREFERENCES.pgvector}})

const showRagSection = computed(() => props.view === 'full' || props.view === 'rag')
const showGlossarySection = computed(() => props.view === 'full' || props.view === 'glossary')

const connectionOptions = computed(() => {
    const options: {id: string; label: string}[] = []
    walkTree(explorer.tree, (node) => {
        if (node.type === 'connection') {
            options.push({id: node.id, label: node.label})
        }
    })
    return options
})

const connectionLabelById = computed(() => {
    const map = new Map<string, string>()
    for (const conn of connectionOptions.value) {
        map.set(conn.id, conn.label)
    }
    return map
})

const connectionCatalog = computed(() => {
    const map = new Map<string, ReturnType<typeof extractConnectionsFromTree>[number]>()
    for (const conn of extractConnectionsFromTree(explorer.tree)) {
        map.set(conn.id, conn)
    }
    return map
})

const entryConnectionSelectOptions = computed<SelectOption[]>(() => [
    {value: '', label: t('settings.knowledge.scopeGlobal')},
    ...connectionOptions.value.map((conn) => ({value: conn.id, label: conn.label})),
])

function databaseOptionsForConnection(connectionId: string): SelectOption[] {
    const conn = connectionCatalog.value.get(connectionId.trim())
    if (!conn?.databases.length) return []
    return conn.databases.map((db) => ({value: db.label, label: db.label}))
}

function snapshotRows(rowsToSnapshot: EditableRow[]): string {
    return JSON.stringify(rowsToSnapshot.map(toKnowledgeEntry))
}

const entriesDirty = computed(() => snapshotRows(rows.value) !== savedRowsSnapshot.value)

const incompleteEntryCount = computed(() =>
    rows.value.filter((row) => isRowIncomplete(row)).length,
)

function isRowIncomplete(row: EditableRow): boolean {
    return !row.term.trim() || !row.definition.trim()
}

function syncSavedSnapshot() {
    savedRowsSnapshot.value = snapshotRows(rows.value)
}

function resetEntriesDraft() {
    try {
        const parsed = JSON.parse(savedRowsSnapshot.value) as AiKnowledgeEntry[]
        rows.value = parsed.map(toEditableRow)
        if (selectedEntryId.value && !rows.value.some((row) => row.id === selectedEntryId.value)) {
            selectedEntryId.value = rows.value[0]?.id ?? null
        }
    } catch {
        /* keep current rows */
    }
}

function entryScopeLabel(row: EditableRow): string {
    const connectionId = row.connectionId.trim()
    if (!connectionId) return t('settings.knowledge.scopeGlobal')
    const connLabel = connectionLabelById.value.get(connectionId) ?? connectionId
    const database = row.database.trim()
    return database ? `${connLabel} · ${database}` : connLabel
}

const ragConnectionSelectOptions = computed<SelectOption[]>(() => [
    {value: '', label: t('settings.knowledge.ragScopeAll')},
    ...connectionOptions.value.map((conn) => ({value: conn.id, label: conn.label})),
])

const vectorStoreModes = computed(() => {
    const modes: {id: AiVectorStorePreference; titleKey: string; hintKey: string}[] = [
        {id: '', titleKey: 'inherit', hintKey: 'inheritHint'},
        {id: 'none', titleKey: 'none', hintKey: 'noneHint'},
        {id: 'memory', titleKey: 'memory', hintKey: 'memoryHint'},
        {id: 'pgvector', titleKey: 'pgvector', hintKey: 'pgvectorHint'},
    ]
    return modes.map((mode) => ({
        id: mode.id,
        title: t(`settings.knowledge.ragVectorStore.${mode.titleKey}`),
        hint: t(`settings.knowledge.ragVectorStore.${mode.hintKey}`),
    }))
})

const effectiveVectorStore = computed(() => ragStatus.value?.vectorStore ?? 'none')

const ragStatusHeadline = computed(() => {
    if (ragLoading.value) return t('settings.knowledge.ragStatusLoading')
    if (ragReady.value) return t('settings.knowledge.ragStatusReady')
    return t('settings.knowledge.ragStatusPending')
})

const ragHealthChecks = computed(() => {
    const status = ragStatus.value
    if (!status) return []
    const store = effectiveVectorStore.value
    return [
        {
            key: 'enabled',
            label: t('settings.knowledge.ragChecks.enabled'),
            ok: status.vectorStoreEnabled,
        },
        {
            key: 'retriever',
            label: t('settings.knowledge.ragChecks.retriever'),
            ok: status.retrieverAvailable,
        },
        {
            key: 'embedding',
            label: t('settings.knowledge.ragChecks.embedding'),
            ok: status.embeddingConfigured !== false,
        },
        {
            key: 'pgvector',
            label: t('settings.knowledge.ragChecks.pgvector'),
            ok: store !== 'pgvector' || status.pgvectorConfigured,
        },
    ]
})

const canRebuildIndex = computed(() => effectiveVectorStore.value === 'pgvector')

function vectorStoreDisplayName(store: string | undefined) {
    const normalized = store?.trim() ?? ''
    const labels: Record<string, string> = {
        '': t('settings.knowledge.ragVectorStore.inherit'),
        none: t('settings.knowledge.ragVectorStore.none'),
        memory: t('settings.knowledge.ragVectorStore.memory'),
        pgvector: t('settings.knowledge.ragVectorStore.pgvector'),
    }
    return labels[normalized] ?? (normalized || '—')
}

function selectVectorStore(id: AiVectorStorePreference) {
    if (denyIfReadOnly()) return
    ragDraft.value = {...ragDraft.value, vectorStore: id}
}

const showPgVectorFields = computed(() => {
    const draftStore = ragDraft.value.vectorStore
    const store = draftStore || ragStatus.value?.serverVectorStore || 'none'
    return store === 'pgvector'
})

const ragDraftDirty = computed(() => {
    const saved = cloneRagPreferences(appConfig.aiPreferences.rag)
    const draft = cloneRagPreferences(ragDraft.value)
    return JSON.stringify(draft) !== JSON.stringify(saved)
})

const entryCount = computed(() => rows.value.length)

const filteredRows = computed(() => {
    const keyword = entryQuery.value.trim().toLowerCase()
    if (!keyword) return rows.value
    return rows.value.filter((row) => {
        const haystack = [
            row.term,
            row.definition,
            row.connectionId,
            row.database,
            row.synonyms,
            row.relatedTables,
            connectionLabelById.value.get(row.connectionId) ?? '',
        ].join(' ').toLowerCase()
        return haystack.includes(keyword)
    })
})

const selectedRow = computed(() =>
    rows.value.find((row) => row.id === selectedEntryId.value) ?? null,
)

const selectedConnectionDatabaseOptions = computed(() => {
    const connectionId = selectedRow.value?.connectionId.trim() ?? ''
    if (!connectionId) return []
    return databaseOptionsForConnection(connectionId)
})

const selectedConnectionDatabaseManual = computed(() => {
    const connectionId = selectedRow.value?.connectionId.trim() ?? ''
    if (!connectionId) return false
    return selectedConnectionDatabaseOptions.value.length === 0
})

const ragReady = computed(() =>
    Boolean(ragStatus.value?.vectorStoreEnabled && ragStatus.value?.retrieverAvailable),
)

function cloneRagPreferences(source: AiRagPreferences): AiRagPreferences {
    const raw = toRaw(source)
    return {
        vectorStore: raw.vectorStore ?? '',
        pgvector: {
            jdbcUrl: raw.pgvector?.jdbcUrl ?? '',
            username: raw.pgvector?.username ?? '',
            password: raw.pgvector?.password ?? '',
            table: raw.pgvector?.table?.trim() || 'ai_evidence_embeddings',
        },
    }
}

function resetRagDraft() {
    ragDraft.value = cloneRagPreferences(appConfig.aiPreferences.rag)
}

watch(
    () => appConfig.aiPreferences.rag,
    (next) => {
        if (!ragDraftDirty.value) {
            ragDraft.value = cloneRagPreferences(next)
        }
    },
    {deep: true, immediate: true},
)

watch(
    () => rows.value.map((row) => row.id),
    (ids) => {
      if (!ids.length) {
        selectedEntryId.value = null
        return
      }
      if (!selectedEntryId.value || !ids.includes(selectedEntryId.value)) {
        selectedEntryId.value = ids[0]
      }
    },
    {immediate: true},
)

watch(
    () => selectedRow.value?.connectionId,
    (connectionId, previous) => {
        if (connectionId === previous || !selectedRow.value) return
        const valid = new Set(
            databaseOptionsForConnection(connectionId ?? '').map((option) => option.value),
        )
        const database = selectedRow.value.database.trim()
        if (database && valid.size > 0 && !valid.has(database)) {
            selectedRow.value.database = ''
        }
    },
)

function ragScopeParams() {
    const connectionId = ragScopeConnectionId.value.trim()
    const database = ragScopeDatabase.value.trim()
    return {
        connectionId: connectionId || undefined,
        database: database || undefined,
    }
}

function toEditableRow(entry: AiKnowledgeEntry): EditableRow {
    return {
        id: entry.id,
        term: entry.term,
        definition: entry.definition,
        connectionId: entry.connectionId ?? '',
        database: entry.database ?? '',
        synonyms: formatCommaList(entry.synonyms),
        relatedTables: formatCommaList(entry.relatedTables),
    }
}

function toKnowledgeEntry(row: EditableRow): AiKnowledgeEntry {
    return {
        id: row.id,
        term: row.term,
        definition: row.definition,
        connectionId: row.connectionId.trim() || undefined,
        database: row.database.trim() || undefined,
        synonyms: parseCommaList(row.synonyms),
        relatedTables: parseCommaList(row.relatedTables),
    }
}

function entryListTitle(row: EditableRow) {
    return row.term.trim() || t('settings.knowledge.unnamedEntry')
}

function entryListMeta(row: EditableRow) {
    const parts: string[] = []
    if (row.connectionId.trim()) {
        parts.push(connectionLabelById.value.get(row.connectionId.trim()) ?? row.connectionId.trim())
    }
    if (row.database.trim()) parts.push(row.database.trim())
    if (row.definition.trim()) {
        const brief = row.definition.trim()
        parts.push(brief.length > 36 ? `${brief.slice(0, 36)}…` : brief)
    } else if (!parts.length) {
        parts.push(t('settings.knowledge.profileMetaUnset'))
    }
    return parts.join(' · ')
}

function selectEntry(id: string) {
    selectedEntryId.value = id
}

async function loadRagStatus() {
    ragLoading.value = true
    ragError.value = ''
    try {
        const scope = ragScopeParams()
        ragStatus.value = await fetchAiRagStatus(scope.connectionId, scope.database)
    } catch {
        ragError.value = t('settings.knowledge.ragLoadFailed')
    } finally {
        ragLoading.value = false
    }
}

async function saveRagSettings() {
    if (denyIfReadOnly()) return
    ragSaving.value = true
    ragError.value = ''
    try {
        appConfig.patchRagPreferences(cloneRagPreferences(ragDraft.value))
        await appConfig.persistConfigNowAsync()
        ragDraft.value = cloneRagPreferences(appConfig.aiPreferences.rag)
        void loadRagStatus()
    } catch (error) {
        console.warn('[rag] save settings failed', error)
        ragError.value = t('settings.knowledge.ragSaveFailed')
    } finally {
        ragSaving.value = false
    }
}

function cancelRagDraft() {
    resetRagDraft()
}

async function rebuildRag() {
    if (denyIfReadOnly()) return
    ragRebuilding.value = true
    ragError.value = ''
    try {
        const scope = ragScopeParams()
        const result = await rebuildAiRagIndex(scope.connectionId, scope.database)
        await loadRagStatus()
        layout.notifyQuiet({
          category: 'workspace',
          titleKey: 'operationDone',
          bodyKey: 'operationDone',
          params: {detail: result.message || t('settings.knowledge.ragRebuildSuccess')},
        })
    } catch {
        ragError.value = t('settings.knowledge.ragRebuildFailed')
    } finally {
        ragRebuilding.value = false
    }
}

async function loadEntries() {
    loading.value = true
    panelError.value = ''
    try {
        const entries = await fetchAiKnowledgeEntries()
        rows.value = entries.map(toEditableRow)
        selectedEntryId.value = rows.value[0]?.id ?? null
        syncSavedSnapshot()
    } catch {
        panelError.value = t('settings.knowledge.loadFailed')
    } finally {
        loading.value = false
    }
}

function addRow() {
    if (denyIfReadOnly()) return
    const row = toEditableRow(createEmptyKnowledgeEntry(createId('kb')))
    rows.value.push(row)
    selectedEntryId.value = row.id
    entryQuery.value = ''
}

function removeSelectedRow() {
    if (denyIfReadOnly() || !selectedEntryId.value) return
    const index = rows.value.findIndex((row) => row.id === selectedEntryId.value)
    if (index < 0) return
    rows.value = rows.value.filter((row) => row.id !== selectedEntryId.value)
    const next = rows.value[index] ?? rows.value[index - 1] ?? null
    selectedEntryId.value = next?.id ?? null
}

async function saveEntries() {
    if (denyIfReadOnly()) return
    const incomplete = incompleteEntryCount.value
    panelError.value = ''
    if (incomplete > 0) {
        panelError.value = t('settings.knowledge.incompleteSaveBlocked', {count: incomplete})
        return
    }
    saving.value = true
    try {
        const saved = await saveAiKnowledgeEntries(rows.value.map(toKnowledgeEntry))
        rows.value = saved.map(toEditableRow)
        if (selectedEntryId.value && !rows.value.some((row) => row.id === selectedEntryId.value)) {
            selectedEntryId.value = rows.value[0]?.id ?? null
        }
        syncSavedSnapshot()
        if (showRagSection.value) {
            await loadRagStatus()
        }
    } catch {
        panelError.value = t('settings.knowledge.saveFailed')
    } finally {
        saving.value = false
    }
}

function cancelEntriesDraft() {
    resetEntriesDraft()
}

onMounted(() => {
    if (showGlossarySection.value) {
        void loadEntries()
    }
    if (showRagSection.value) {
        void loadRagStatus()
    }
})

watch([ragScopeConnectionId, ragScopeDatabase], () => {
    if (showRagSection.value) {
        void loadRagStatus()
    }
})
</script>

<template>
  <SettingsPageShell
      :embedded="props.embedded"
      :width="props.embedded ? 'full' : 'default'"
      :title="t('settings.knowledge.title')"
      :subtitle="t('settings.knowledge.subtitle')"
      :readonly="readOnly"
      :readonly-hint="hint"
      :class="[`is-view-${props.view}`]"
  >
    <template v-if="!props.embedded" #tips>
      <SettingsTipsCard
          :title="t('settings.knowledge.title')"
          :content="t('settings.knowledge.subtitle')"
          icon="settings-knowledge"
      />
    </template>

    <DwInlineAlert :message="panelError"/>
    <DwInlineAlert :message="ragError"/>

    <section v-if="showRagSection" class="kb-rag-panel kb-rag-panel--v2">
      <div class="kb-rag-status" :class="{'is-ready': ragReady, 'is-pending': !ragReady && !ragLoading, 'is-loading': ragLoading}">
        <div class="kb-rag-status__intro">
          <div class="kb-rag-status__badge">
            <span class="kb-rag-status__dot" aria-hidden="true"/>
            <span>{{ ragStatusHeadline }}</span>
          </div>
          <p class="kb-rag-status__message">
            {{ ragStatus?.message || t('settings.knowledge.ragHint') }}
          </p>
        </div>

        <div v-if="ragStatus && !ragLoading" class="kb-rag-status__metrics">
          <div class="kb-rag-stat">
            <span class="kb-rag-stat__value">{{ ragStatus.knowledgeEntryCount }}</span>
            <span class="kb-rag-stat__label">{{ t('settings.knowledge.ragFields.entries') }}</span>
          </div>
          <div class="kb-rag-stat">
            <span class="kb-rag-stat__value">{{ vectorStoreDisplayName(ragStatus.vectorStore) }}</span>
            <span class="kb-rag-stat__label">{{ t('settings.knowledge.ragFields.vectorStore') }}</span>
          </div>
          <div class="kb-rag-stat">
            <span class="kb-rag-stat__value">
              {{ ragStatus.embeddingProvider || '—' }}
              <template v-if="ragStatus.embeddingDimensions != null">
                · {{ ragStatus.embeddingDimensions }}d
              </template>
            </span>
            <span class="kb-rag-stat__label">{{ t('settings.knowledge.ragFields.embeddingProvider') }}</span>
          </div>
        </div>
        <div v-else-if="ragLoading" class="kb-rag-status__metrics kb-rag-status__metrics--loading">
          <span>{{ t('settings.knowledge.ragLoading') }}</span>
        </div>

        <div class="kb-rag-status__actions">
          <DwButton
              variant="ghost"
              size="sm"
              type="button"
              :disabled="ragLoading || ragRebuilding"
              :loading="ragLoading"
              @click="loadRagStatus"
          >
            {{ t('settings.knowledge.ragRefreshStatus') }}
          </DwButton>
          <DwButton
              variant="secondary"
              size="sm"
              type="button"
              :disabled="ragLoading || ragRebuilding || readOnly || !canRebuildIndex"
              :loading="ragRebuilding"
              :title="canRebuildIndex ? undefined : t('settings.knowledge.ragRebuildDisabledHint')"
              @click="rebuildRag"
          >
            {{ ragRebuilding ? t('settings.knowledge.ragRebuilding') : t('settings.knowledge.ragRebuild') }}
          </DwButton>
        </div>
      </div>

      <DwSplitPane
          class="kb-rag-layout"
          storage-key="dw.split.settings-kb-rag"
          default-ratio="half"
          :default-width="520"
          :min-width="320"
          :max-width="900"
          :end-min-width="260"
          :stack-below="900"
          :start-class="['kb-rag-card', 'kb-rag-card--config', readOnly ? 'is-readonly' : '']"
          end-class="kb-rag-card kb-rag-card--side"
      >
        <template #start>
          <header class="kb-rag-card__head">
            <div>
              <h4>{{ t('settings.knowledge.ragConfigTitle') }}</h4>
              <p>{{ t('settings.knowledge.ragConfigHint') }}</p>
            </div>
            <div class="kb-rag-card__badges">
              <span v-if="ragStatus?.serverVectorStore" class="kb-rag-badge">
                {{ t('settings.knowledge.ragServerDefault', {store: vectorStoreDisplayName(ragStatus.serverVectorStore)}) }}
              </span>
              <span class="kb-rag-badge kb-rag-badge--accent">
                {{ t('settings.knowledge.ragEffectiveStore', {store: vectorStoreDisplayName(effectiveVectorStore)}) }}
              </span>
            </div>
          </header>

          <div class="kb-rag-store-grid" role="radiogroup" :aria-label="t('settings.knowledge.ragVectorStore.label')">
            <button
                v-for="mode in vectorStoreModes"
                :key="mode.id || 'inherit'"
                class="kb-rag-store-tile"
                :class="{
                  'is-active': ragDraft.vectorStore === mode.id,
                  'is-inherit': mode.id === '',
                }"
                type="button"
                role="radio"
                :aria-checked="ragDraft.vectorStore === mode.id"
                :disabled="readOnly"
                @click="selectVectorStore(mode.id)"
            >
              <span class="kb-rag-store-tile__title">{{ mode.title }}</span>
              <span class="kb-rag-store-tile__hint">{{ mode.hint }}</span>
            </button>
          </div>

          <div v-if="showPgVectorFields" class="kb-rag-pg">
            <div class="kb-rag-pg__head">
              <h5>{{ t('settings.knowledge.ragPgvector.title') }}</h5>
              <p>{{ t('settings.knowledge.ragPgvector.hint') }}</p>
            </div>
            <div class="kb-rag-pg__form">
              <FormField :label="t('settings.knowledge.ragPgvector.jdbcUrl')" input-id="rag-pg-jdbc">
                <template #default="{ id }">
                  <DwInput
                      :id="id"
                      v-model="ragDraft.pgvector.jdbcUrl"
                      :disabled="readOnly"
                      :placeholder="t('settings.knowledge.ragPgvector.jdbcUrlPlaceholder')"
                  />
                </template>
              </FormField>
              <div class="kb-rag-pg__grid">
                <FormField :label="t('settings.knowledge.ragPgvector.username')" input-id="rag-pg-user">
                  <template #default="{ id }">
                    <DwInput :id="id" v-model="ragDraft.pgvector.username" :disabled="readOnly"/>
                  </template>
                </FormField>
                <FormField :label="t('settings.knowledge.ragPgvector.password')" input-id="rag-pg-pass">
                  <template #default="{ id }">
                    <DwSecretInput
                        :id="id"
                        v-model="ragDraft.pgvector.password"
                        :disabled="readOnly"
                        :show-label="t('settings.ai.showKey')"
                        :hide-label="t('settings.ai.hideKey')"
                    />
                  </template>
                </FormField>
              </div>
              <FormField :label="t('settings.knowledge.ragPgvector.table')" input-id="rag-pg-table">
                <template #default="{ id }">
                  <DwInput
                      :id="id"
                      v-model="ragDraft.pgvector.table"
                      :disabled="readOnly"
                      :placeholder="t('settings.knowledge.ragPgvector.tablePlaceholder')"
                  />
                </template>
              </FormField>
            </div>
          </div>

          <footer v-if="!readOnly" class="kb-rag-card__footer">
            <span class="kb-rag-card__footer-hint">
              {{ ragDraftDirty ? t('settings.knowledge.ragUnsavedHint') : t('settings.knowledge.ragSavedHint') }}
            </span>
            <div class="kb-rag-card__footer-actions">
              <DwButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  :disabled="!ragDraftDirty || ragSaving"
                  @click="cancelRagDraft"
              >
                {{ t('settings.knowledge.ragCancel') }}
              </DwButton>
              <DwButton
                  variant="primary"
                  size="sm"
                  type="button"
                  :disabled="!ragDraftDirty"
                  :loading="ragSaving"
                  @click="saveRagSettings"
              >
                {{ ragSaving ? t('settings.knowledge.ragSaving') : t('settings.knowledge.ragSave') }}
              </DwButton>
            </div>
          </footer>
        </template>

        <template #end>
          <section class="kb-rag-side-block">
            <header class="kb-rag-side-block__head">
              <h4>{{ t('settings.knowledge.ragHealthTitle') }}</h4>
            </header>
            <ul class="kb-rag-checklist">
              <li
                  v-for="check in ragHealthChecks"
                  :key="check.key"
                  class="kb-rag-checklist__item"
                  :class="{'is-ok': check.ok, 'is-warn': !check.ok}"
              >
                <span class="kb-rag-checklist__icon" aria-hidden="true"/>
                <span>{{ check.label }}</span>
              </li>
              <li v-if="!ragHealthChecks.length" class="kb-rag-checklist__item kb-rag-checklist__item--empty">
                {{ t('settings.knowledge.ragLoading') }}
              </li>
            </ul>
          </section>

          <section class="kb-rag-side-block">
            <header class="kb-rag-side-block__head">
              <h4>{{ t('settings.knowledge.ragIndexScopeTitle') }}</h4>
              <p>{{ t('settings.knowledge.ragScopeHint') }}</p>
            </header>
            <div class="kb-rag-scope-form">
              <FormField :label="t('settings.knowledge.ragScopeConnection')" input-id="rag-scope-connection">
                <template #default="{ id }">
                  <DwSelect
                      :id="id"
                      v-model="ragScopeConnectionId"
                      size="sm"
                      :options="ragConnectionSelectOptions"
                  />
                </template>
              </FormField>
              <FormField :label="t('settings.knowledge.ragScopeDatabase')" input-id="rag-scope-database">
                <template #default="{ id }">
                  <DwInput
                      :id="id"
                      v-model="ragScopeDatabase"
                      variant="sm"
                      :placeholder="t('settings.knowledge.ragScopeDatabasePlaceholder')"
                  />
                </template>
              </FormField>
            </div>
          </section>
        </template>
      </DwSplitPane>
    </section>

    <section v-if="showGlossarySection" class="kb-entries-panel kb-entries-panel--v2" :class="{'is-readonly': readOnly}">
      <div class="kb-entries-panel__head">
        <div class="kb-entries-panel__title-row">
          <h3>{{ t('settings.knowledge.entriesTitle') }}</h3>
          <span class="kb-entries-panel__count">{{ entryCount }}</span>
          <span v-if="incompleteEntryCount > 0" class="kb-entries-panel__warn">
            {{ t('settings.knowledge.incompleteCount', {count: incompleteEntryCount}) }}
          </span>
        </div>
        <p class="kb-entries-panel__hint">{{ t('settings.knowledge.entriesHint') }}</p>
      </div>

      <EmptyState v-if="loading" embedded bordered :title="t('settings.knowledge.loading')"/>

      <DwSplitPane
          v-else
          class="kb-entries-workspace"
          storage-key="dw.split.settings-kb-entries"
          default-ratio="third"
          :default-width="240"
          :min-width="200"
          :max-width="420"
          :end-min-width="320"
          :stack-below="900"
          start-class="kb-entry-sidebar"
          end-class="kb-entry-editor"
      >
        <template #start>
          <div class="kb-entry-sidebar__toolbar">
            <DwInput
                v-model="entryQuery"
                variant="sm"
                type="search"
                :placeholder="t('settings.knowledge.searchEntries')"
            />
          </div>

          <div class="kb-entry-sidebar__list" role="listbox" :aria-label="t('settings.knowledge.entriesTitle')">
            <EmptyState
                v-if="!rows.length"
                embedded
                compact
                :title="t('settings.knowledge.empty')"
                :hint="t('settings.knowledge.emptyHint')"
            />
            <EmptyState
                v-else-if="!filteredRows.length"
                embedded
                compact
                :title="t('settings.knowledge.noEntryMatch')"
            />
            <button
                v-for="row in filteredRows"
                :key="row.id"
                class="kb-entry-item"
                :class="{
                  'is-active': row.id === selectedEntryId,
                  'is-incomplete': isRowIncomplete(row),
                }"
                type="button"
                role="option"
                :aria-selected="row.id === selectedEntryId"
                @click="selectEntry(row.id)"
            >
              <span class="kb-entry-item__row">
                <span class="kb-entry-item__name">{{ entryListTitle(row) }}</span>
                <span
                    v-if="isRowIncomplete(row)"
                    class="kb-entry-item__badge"
                    :title="t('settings.knowledge.incompleteEntry')"
                >
                  !
                </span>
              </span>
              <span class="kb-entry-item__meta">{{ entryListMeta(row) }}</span>
            </button>
          </div>

          <button v-if="!readOnly" class="kb-entry-sidebar__add" type="button" @click="addRow">
            {{ t('settings.knowledge.addRow') }}
          </button>
        </template>

        <template #end>
          <EmptyState
              v-if="!selectedRow"
              embedded
              bordered
              :title="t('settings.knowledge.selectEntryTitle')"
              :hint="t('settings.knowledge.selectEntryHint')"
          />

          <template v-else>
            <header class="kb-entry-editor__head">
              <div class="kb-entry-editor__title">
                <h4>{{ entryListTitle(selectedRow) }}</h4>
                <div class="kb-entry-editor__chips">
                  <span class="kb-entry-chip">{{ entryScopeLabel(selectedRow) }}</span>
                  <span v-if="isRowIncomplete(selectedRow)" class="kb-entry-chip kb-entry-chip--warn">
                    {{ t('settings.knowledge.incompleteEntry') }}
                  </span>
                </div>
              </div>
              <DwButton
                  v-if="!readOnly"
                  variant="ghost"
                  size="sm"
                  class="kb-entry-editor__delete"
                  type="button"
                  @click="removeSelectedRow"
              >
                {{ t('settings.knowledge.deleteRow') }}
              </DwButton>
            </header>

            <div class="kb-entry-editor__body">
              <section class="kb-entry-section">
                <header class="kb-entry-section__head">
                  <h5>{{ t('settings.knowledge.sectionCore') }}</h5>
                  <p>{{ t('settings.knowledge.sectionCoreHint') }}</p>
                </header>
                <div class="kb-entry-section__form">
                  <FormField :label="t('settings.knowledge.columns.term')" input-id="kb-selected-term">
                    <template #default="{ id }">
                      <DwInput
                          :id="id"
                          v-model="selectedRow.term"
                          :disabled="readOnly"
                          :placeholder="t('settings.knowledge.placeholders.term')"
                      />
                    </template>
                  </FormField>

                  <FormField :label="t('settings.knowledge.columns.definition')" input-id="kb-selected-definition">
                    <template #default="{ id }">
                      <DwInput
                          :id="id"
                          v-model="selectedRow.definition"
                          :disabled="readOnly"
                          :rows="5"
                          :placeholder="t('settings.knowledge.placeholders.definition')"
                      />
                    </template>
                  </FormField>
                </div>
              </section>

              <section class="kb-entry-section">
                <header class="kb-entry-section__head">
                  <h5>{{ t('settings.knowledge.sectionScope') }}</h5>
                  <p>{{ t('settings.knowledge.sectionScopeHint') }}</p>
                </header>
                <div class="kb-entry-section__form kb-entry-section__form--grid">
                  <FormField :label="t('settings.knowledge.columns.connection')" input-id="kb-selected-connection">
                    <template #default="{ id }">
                      <DwSelect
                          :id="id"
                          v-model="selectedRow.connectionId"
                          size="sm"
                          :disabled="readOnly"
                          :options="entryConnectionSelectOptions"
                      />
                    </template>
                  </FormField>
                  <FormField :label="t('settings.knowledge.columns.database')" input-id="kb-selected-database">
                    <template #default="{ id }">
                      <DwSelect
                          v-if="selectedRow.connectionId.trim() && selectedConnectionDatabaseOptions.length"
                          :id="id"
                          v-model="selectedRow.database"
                          size="sm"
                          :disabled="readOnly"
                          :options="[
                            {value: '', label: t('settings.knowledge.scopeAllDatabases')},
                            ...selectedConnectionDatabaseOptions,
                          ]"
                      />
                      <DwInput
                          v-else
                          :id="id"
                          v-model="selectedRow.database"
                          variant="sm"
                          :disabled="readOnly || !selectedRow.connectionId.trim()"
                          :placeholder="selectedRow.connectionId.trim()
                            ? t('settings.knowledge.placeholders.database')
                            : t('settings.knowledge.databaseNeedsConnection')"
                      />
                    </template>
                  </FormField>
                  <p
                      v-if="selectedConnectionDatabaseManual"
                      class="kb-entry-section__note"
                  >
                    {{ t('settings.knowledge.databaseManualHint') }}
                  </p>
                </div>
              </section>

              <section class="kb-entry-section">
                <header class="kb-entry-section__head">
                  <h5>{{ t('settings.knowledge.sectionEnrichment') }}</h5>
                  <p>{{ t('settings.knowledge.sectionEnrichmentHint') }}</p>
                </header>
                <div class="kb-entry-section__form kb-entry-section__form--grid">
                  <FormField :label="t('settings.knowledge.columns.synonyms')" input-id="kb-selected-synonyms">
                    <template #default="{ id }">
                      <DwInput
                          :id="id"
                          v-model="selectedRow.synonyms"
                          :disabled="readOnly"
                          :placeholder="t('settings.knowledge.placeholders.synonyms')"
                      />
                    </template>
                  </FormField>
                  <FormField :label="t('settings.knowledge.columns.relatedTables')" input-id="kb-selected-tables">
                    <template #default="{ id }">
                      <DwInput
                          :id="id"
                          v-model="selectedRow.relatedTables"
                          :disabled="readOnly"
                          :placeholder="t('settings.knowledge.placeholders.relatedTables')"
                      />
                    </template>
                  </FormField>
                </div>
              </section>
            </div>
          </template>
        </template>
      </DwSplitPane>

      <footer v-if="!loading" class="kb-entries-footer">
        <span class="kb-entries-footer__hint">
          <template v-if="readOnly">{{ hint }}</template>
          <template v-else-if="entriesDirty">{{ t('settings.knowledge.entriesUnsavedHint') }}</template>
          <template v-else>{{ t('settings.knowledge.entriesSavedHint') }}</template>
        </span>
        <div v-if="!readOnly" class="kb-entries-footer__actions">
          <DwButton
              variant="ghost"
              size="sm"
              type="button"
              :disabled="!entriesDirty || saving"
              @click="cancelEntriesDraft"
          >
            {{ t('settings.knowledge.entriesDiscard') }}
          </DwButton>
          <DwButton
              variant="primary"
              type="button"
              :loading="saving"
              :disabled="saving || !entriesDirty || incompleteEntryCount > 0"
              @click="saveEntries"
          >
            {{ saving ? t('settings.knowledge.saving') : t('common.save') }}
          </DwButton>
        </div>
      </footer>
    </section>
  </SettingsPageShell>
</template>

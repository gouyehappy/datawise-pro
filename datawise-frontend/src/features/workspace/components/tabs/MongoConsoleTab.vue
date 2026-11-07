<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInput, EmptyState, WorkbenchListPage} from '@/core/components'
import type {WorkspaceTab} from '@/core/types'
import {tableDataApi} from '@/api'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {normalizeMongoDocumentFilter} from '@/features/workspace/services/mongo-document-filter.service'
import {
    findMongoDatabaseNode,
    formatMongoDocumentJson,
    listMongoCollectionsUnderDatabase,
    mongoDocumentLabel,
    rowToMongoDocument,
    type MongoCollectionRef,
} from '@/features/workspace/services/mongo-document-view.service'
import {
    formatJsonEditorText,
    validateJsonEditorText,
} from '@/features/workspace/data-grid/services/grid-cell-editor.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()

const collectionFilter = ref('')
const collectionsLoading = ref(false)
const collectionsError = ref<string | null>(null)
const collections = ref<MongoCollectionRef[]>([])

const filterDraft = ref('')
const filterError = ref<string | null>(null)
const appliedFilter = ref<string | undefined>(undefined)

const docsLoading = ref(false)
const docsError = ref<string | null>(null)
const documents = ref<Record<string, unknown>[]>([])
const hasMore = ref(false)
const cursorId = ref<string | null>(null)
const selectedIndex = ref(-1)
const jsonDraft = ref('')
const jsonError = ref<string | null>(null)

const connectionId = computed(() => props.tab.connectionId ?? '')
const database = computed(() => props.tab.database ?? '')
const collectionName = computed(() => props.tab.tableName ?? '')

const connectionLabel = computed(() => {
    if (!connectionId.value) return t('explorer.mongoConsole.noConnection')
    return explorer.findNode(connectionId.value)?.label ?? connectionId.value
})

const subtitle = computed(() => {
    const parts = [connectionLabel.value]
    if (database.value) parts.push(database.value)
    if (collectionName.value) parts.push(collectionName.value)
    return parts.join(' · ')
})

const filteredCollections = computed(() => {
    const q = collectionFilter.value.trim().toLowerCase()
    if (!q) return collections.value
    return collections.value.filter((item) => item.name.toLowerCase().includes(q))
})

const selectedDoc = computed(() =>
    selectedIndex.value >= 0 ? documents.value[selectedIndex.value] ?? null : null,
)

async function refreshCollections() {
    if (!connectionId.value) {
        collections.value = []
        return
    }
    collectionsLoading.value = true
    collectionsError.value = null
    try {
        await explorer.ensureChildrenLoaded(connectionId.value)
        const connectionNode = explorer.findNode(connectionId.value)
        if (!database.value) {
            collections.value = []
            return
        }
        let databaseNode = findMongoDatabaseNode(connectionNode, database.value)
        if (!databaseNode && connectionNode) {
            await explorer.ensureChildrenLoaded(connectionId.value)
            databaseNode = findMongoDatabaseNode(explorer.findNode(connectionId.value), database.value)
        }
        if (!databaseNode) {
            collections.value = []
            collectionsError.value = t('explorer.mongoConsole.databaseMissing')
            return
        }
        await explorer.ensureChildrenLoaded(databaseNode.id)
        databaseNode = explorer.findNode(databaseNode.id) ?? databaseNode
        const tablesFolder = databaseNode.children?.find(
            (child) => child.type === 'folder' && child.label.toLowerCase() === 'tables',
        )
        if (tablesFolder) {
            await explorer.ensureChildrenLoaded(tablesFolder.id)
            databaseNode = explorer.findNode(databaseNode.id) ?? databaseNode
        }
        collections.value = listMongoCollectionsUnderDatabase(databaseNode)
    } catch (error) {
        collections.value = []
        collectionsError.value = resolveCaughtApiErrorMessage(error, t, 'explorer.mongoConsole.loadCollectionsFailed')
    } finally {
        collectionsLoading.value = false
    }
}

async function loadDocuments(options?: {append?: boolean}) {
    if (!connectionId.value || !database.value || !collectionName.value) {
        documents.value = []
        selectedIndex.value = -1
        jsonDraft.value = ''
        return
    }
    docsLoading.value = true
    docsError.value = null
    try {
        const next = await tableDataApi.fetch(collectionName.value, {
            connectionId: connectionId.value,
            database: database.value,
            maxRows: 50,
            filter: appliedFilter.value,
            cursorId: options?.append ? (cursorId.value ?? undefined) : undefined,
        })
        const columns = (next.columns ?? []) as Array<{key?: string; name?: string}>
        const rows = (next.rows ?? []) as Array<Record<string, unknown>>
        const mapped = rows.map((row) => rowToMongoDocument(columns, row))
        documents.value = options?.append ? [...documents.value, ...mapped] : mapped
        cursorId.value = next.cursorId ?? null
        hasMore.value = Boolean(next.hasMore)
        if (!options?.append) {
            selectedIndex.value = documents.value.length > 0 ? 0 : -1
            syncJsonFromSelection()
        }
    } catch (error) {
        if (!options?.append) {
            documents.value = []
            selectedIndex.value = -1
            jsonDraft.value = ''
        }
        docsError.value = resolveCaughtApiErrorMessage(error, t, 'explorer.mongoConsole.loadDocsFailed')
    } finally {
        docsLoading.value = false
    }
}

function syncJsonFromSelection() {
    const doc = selectedDoc.value
    jsonDraft.value = doc ? formatMongoDocumentJson(doc) : ''
    jsonError.value = null
}

function selectCollection(item: MongoCollectionRef) {
    workspace.updateTabContext(props.tab.id, {
        tableName: item.name,
        explorerNodeId: item.nodeId,
    })
}

function selectDocument(index: number) {
    selectedIndex.value = index
    syncJsonFromSelection()
}

function applyFilter() {
    const normalized = normalizeMongoDocumentFilter(filterDraft.value)
    if (normalized.error === 'invalidJson') {
        filterError.value = t('dataGrid.documentFilter.invalidJson')
        return
    }
    if (normalized.error === 'notObject') {
        filterError.value = t('dataGrid.documentFilter.notObject')
        return
    }
    filterError.value = null
    appliedFilter.value = normalized.filter
    if (normalized.filter) filterDraft.value = normalized.filter
    void loadDocuments()
}

function clearFilter() {
    filterDraft.value = ''
    filterError.value = null
    appliedFilter.value = undefined
    void loadDocuments()
}

function formatJson() {
    const errorKey = validateJsonEditorText(jsonDraft.value)
    if (errorKey) {
        jsonError.value = t('dataGrid.cellEditor.invalidJson')
        return
    }
    jsonDraft.value = formatJsonEditorText(jsonDraft.value)
    jsonError.value = null
}

function openIndexes() {
    if (!connectionId.value || !database.value || !collectionName.value) return
    const id = workspace.openTable(
        collectionName.value,
        connectionId.value,
        undefined,
        database.value,
        props.tab.explorerNodeId,
        'properties',
        'table',
    )
    workspace.updateTabContext(id, {tableSection: 'indexes'})
}

function openAsTable() {
    if (!connectionId.value || !database.value || !collectionName.value) return
    workspace.openTable(
        collectionName.value,
        connectionId.value,
        undefined,
        database.value,
        props.tab.explorerNodeId,
        'data',
        'table',
    )
}

watch(
    [connectionId, database],
    () => {
        void refreshCollections()
    },
    {immediate: true},
)

watch(
    collectionName,
    () => {
        filterDraft.value = ''
        filterError.value = null
        appliedFilter.value = undefined
        void loadDocuments()
    },
    {immediate: true},
)
</script>

<template>
  <WorkbenchListPage
      content-class="mongo-workbench"
      recipe="wb-split"
      body-padding="flush"
      split-storage-key="dw.split.mongo-console"
      :title="t('explorer.mongoConsole.title')"
      :subtitle="subtitle"
      left-class="mongo-workbench__left"
      right-class="mongo-workbench__right dw-seam-stack dw-seam-stack--flush"
  >
    <template #actions>
      <DwButton variant="ghost" type="button" :disabled="!collectionName" @click="openAsTable">
        {{ t('explorer.mongoConsole.openTable') }}
      </DwButton>
      <DwButton variant="ghost" type="button" :disabled="!collectionName" @click="openIndexes">
        {{ t('explorer.mongoConsole.openIndexes') }}
      </DwButton>
      <DwButton variant="ghost" type="button" :disabled="collectionsLoading" @click="refreshCollections">
        {{ t('explorer.mongoConsole.refresh') }}
      </DwButton>
    </template>

    <template #left>
      <section class="mongo-workbench__collections dw-workbench-card">
        <header class="dw-workbench-card__head">
          <h3>{{ t('explorer.mongoConsole.collections') }}</h3>
        </header>
        <div class="mongo-workbench__collection-filter">
          <DwInput
              v-model="collectionFilter"
              type="search"
              variant="sm"
              :placeholder="t('explorer.mongoConsole.filterCollections')"
          />
        </div>
        <p v-if="collectionsError" class="mongo-workbench__error">{{ collectionsError }}</p>
        <p v-else-if="collectionsLoading" class="mongo-workbench__muted">{{ t('explorer.mongoConsole.loading') }}</p>
        <EmptyState
            v-else-if="!database"
            compact
            :title="t('explorer.mongoConsole.pickDatabase')"
            :hint="t('explorer.mongoConsole.pickDatabaseHint')"
        />
        <EmptyState
            v-else-if="filteredCollections.length === 0"
            compact
            :title="t('explorer.mongoConsole.noCollections')"
            :hint="t('explorer.mongoConsole.noCollectionsHint')"
        />
        <ul v-else class="mongo-workbench__collection-list" role="listbox">
          <li
              v-for="item in filteredCollections"
              :key="item.nodeId"
              role="option"
              :aria-selected="item.name === collectionName"
          >
            <button
                type="button"
                class="mongo-workbench__collection-item"
                :class="{'is-active': item.name === collectionName}"
                @click="selectCollection(item)"
            >
              {{ item.name }}
            </button>
          </li>
        </ul>
      </section>
    </template>

    <template #right>
      <section v-if="!collectionName" class="mongo-workbench__empty dw-workbench-card">
        <EmptyState
            :title="t('explorer.mongoConsole.emptyTitle')"
            :hint="t('explorer.mongoConsole.emptyHint')"
        />
      </section>

      <template v-else>
        <section class="mongo-workbench__filter dw-workbench-card">
          <header class="dw-workbench-card__head">
            <h3>{{ t('dataGrid.documentFilter.label') }}</h3>
          </header>
          <div class="mongo-workbench__filter-row">
            <DwInput
                v-model="filterDraft"
                class="mongo-workbench__filter-input"
                variant="mono"
                :rows="2"
                :placeholder="t('dataGrid.documentFilter.placeholder')"
            />
            <div class="mongo-workbench__filter-actions">
              <DwButton type="button" :disabled="docsLoading" @click="applyFilter">
                {{ t('dataGrid.documentFilter.apply') }}
              </DwButton>
              <DwButton
                  variant="ghost"
                  type="button"
                  :disabled="docsLoading || (!filterDraft && !appliedFilter)"
                  @click="clearFilter"
              >
                {{ t('dataGrid.documentFilter.clear') }}
              </DwButton>
            </div>
          </div>
          <p v-if="filterError" class="mongo-workbench__error">{{ filterError }}</p>
        </section>

        <section class="mongo-workbench__docs dw-workbench-card">
          <header class="dw-workbench-card__head">
            <h3>{{ t('explorer.mongoConsole.documents') }}</h3>
            <span class="mongo-workbench__muted">
              {{ t('explorer.mongoConsole.docCount', {count: documents.length}) }}
            </span>
          </header>
          <p v-if="docsError" class="mongo-workbench__error">{{ docsError }}</p>
          <p v-else-if="docsLoading && documents.length === 0" class="mongo-workbench__muted">
            {{ t('explorer.mongoConsole.loading') }}
          </p>
          <EmptyState
              v-else-if="documents.length === 0"
              compact
              :title="t('explorer.mongoConsole.noDocuments')"
              :hint="t('explorer.mongoConsole.noDocumentsHint')"
          />
          <div v-else class="mongo-workbench__docs-split">
            <ul class="mongo-workbench__doc-list" role="listbox">
              <li
                  v-for="(doc, index) in documents"
                  :key="`${mongoDocumentLabel(doc, index)}-${index}`"
                  role="option"
                  :aria-selected="index === selectedIndex"
              >
                <button
                    type="button"
                    class="mongo-workbench__doc-item"
                    :class="{'is-active': index === selectedIndex}"
                    @click="selectDocument(index)"
                >
                  {{ mongoDocumentLabel(doc, index) }}
                </button>
              </li>
            </ul>
            <div class="mongo-workbench__json-pane">
              <div class="mongo-workbench__json-toolbar">
                <span>{{ t('dataGrid.documentView.title') }}</span>
                <DwButton variant="ghost" type="button" :disabled="!jsonDraft" @click="formatJson">
                  {{ t('dataGrid.cellEditor.formatJson') }}
                </DwButton>
              </div>
              <DwInput
                  v-model="jsonDraft"
                  class="mongo-workbench__json-editor"
                  variant="mono"
                  :rows="16"
                  :placeholder="t('explorer.mongoConsole.jsonPlaceholder')"
              />
              <p v-if="jsonError" class="mongo-workbench__error">{{ jsonError }}</p>
              <p class="mongo-workbench__muted">{{ t('explorer.mongoConsole.jsonEditHint') }}</p>
            </div>
          </div>
          <div v-if="hasMore" class="mongo-workbench__load-more">
            <DwButton variant="ghost" type="button" :disabled="docsLoading" @click="loadDocuments({append: true})">
              {{ t('explorer.mongoConsole.loadMore') }}
            </DwButton>
          </div>
        </section>
      </template>
    </template>
  </WorkbenchListPage>
</template>

<style scoped>
.mongo-workbench {
  min-width: 0;
}

.mongo-workbench__left,
.mongo-workbench__right {
  min-width: 0;
}

.mongo-workbench__collections,
.mongo-workbench__filter,
.mongo-workbench__docs,
.mongo-workbench__empty {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.mongo-workbench__collections {
  flex: 1;
}

.mongo-workbench__collection-filter {
  padding: 0 var(--dw-space-3) var(--dw-space-2);
}

.mongo-workbench__collection-list,
.mongo-workbench__doc-list {
  list-style: none;
  margin: 0;
  padding: var(--dw-space-1) 0;
  overflow: auto;
  flex: 1;
  min-height: 0;
}

.mongo-workbench__collection-item,
.mongo-workbench__doc-item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: inherit;
  padding: var(--dw-space-2) var(--dw-space-3);
  cursor: pointer;
  font: inherit;
}

.mongo-workbench__collection-item:hover,
.mongo-workbench__doc-item:hover,
.mongo-workbench__collection-item.is-active,
.mongo-workbench__doc-item.is-active {
  background: var(--dw-bg-muted);
}

.mongo-workbench__filter-row {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  padding: 0 var(--dw-space-3) var(--dw-space-3);
}

.mongo-workbench__filter-actions {
  display: flex;
  gap: var(--dw-space-2);
}

.mongo-workbench__docs {
  flex: 1;
}

.mongo-workbench__docs-split {
  display: grid;
  grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
  gap: var(--dw-space-2);
  flex: 1;
  min-height: 0;
  padding: 0 var(--dw-space-3) var(--dw-space-3);
}

.mongo-workbench__json-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: var(--dw-space-2);
}

.mongo-workbench__json-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-2);
}

.mongo-workbench__json-editor {
  flex: 1;
  min-height: 12rem;
}

.mongo-workbench__load-more {
  padding: 0 var(--dw-space-3) var(--dw-space-3);
}

.mongo-workbench__error {
  color: var(--dw-danger);
  margin: 0 var(--dw-space-3) var(--dw-space-2);
  font-size: var(--dw-font-size-sm);
}

.mongo-workbench__muted {
  color: var(--dw-text-muted);
  margin: 0 var(--dw-space-3) var(--dw-space-2);
  font-size: var(--dw-font-size-sm);
}
</style>

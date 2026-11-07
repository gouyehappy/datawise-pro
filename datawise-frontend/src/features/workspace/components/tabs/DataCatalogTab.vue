<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DwDataGrid from '@/core/components/DwDataGrid.vue'
import SearchInput from '@/core/components/SearchInput.vue'
import {AppModal, DwButton, EmptyState, SidePanel} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {DwDataGridColumn, DwDataGridLabels} from '@/core/components/dw-data-grid.types'
import type {WorkspaceTab} from '@/core/types'
import {platformApi} from '@/api'
import {lineageApi} from '@/api/modules/lineage'
import type {DiscoveryFacets, DiscoveryHit} from '@/features/platform/types/platform.types'
import type {LineageImpactItem} from '@/features/lineage/types/lineage.types'
import {
    canJumpLineage,
    DATA_CATALOG_PAGE_SIZE,
    discoveryHitRowKey,
    hasActiveDataCatalogFacets,
    listRelatedTableChoices,
    needsRelatedTablePicker,
    nextDiscoveryOffset,
    pickLineageJumpTarget,
    resolveDataCatalogFacetOptions,
    resolveLineageImpactSource,
    resolveDiscoveryHitColumnPeek,
    toDiscoverySearchFilters,
    toggleFacetValue,
    type DataCatalogFacets,
    type DiscoveryFacetKind,
    type RelatedTableChoice,
} from '@/features/discovery/services/data-catalog.service'
import {activateGlobalObjectSearchEntry} from '@/features/explorer/services/global-object-search.actions'
import {discoveryHitsToSearchEntries} from '@/features/explorer/services/global-object-discovery.service'
import {useDebouncedRef} from '@/core/utils/debounced-ref'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const layout = useLayoutStore()
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()

const query = ref('')
const debouncedQuery = useDebouncedRef(query, 220)
const loading = ref(false)
const error = ref('')
const hits = ref<DiscoveryHit[]>([])
const totalHits = ref(0)
const hasMore = ref(false)
const loadingMore = ref(false)
const facets = reactive<DataCatalogFacets>({
    kinds: [],
    connectionIds: [],
    owners: [],
    tags: [],
})
const serverFacets = ref<DiscoveryFacets | null>(null)
const selectedKeys = ref<string[]>([])
const lineageOpen = ref(false)
const lineageLoading = ref(false)
const lineageCandidates = ref<LineageImpactItem[]>([])
const lineageSource = ref<DiscoveryHit | null>(null)
const lineageRelatedOverride = ref<string | null>(null)
const relatedTableOpen = ref(false)
const relatedTableCandidates = ref<RelatedTableChoice[]>([])

let searchSeq = 0
let activeQuery = ''

const facetOptions = computed(() => resolveDataCatalogFacetOptions(serverFacets.value, hits.value))
const facetsActive = computed(() => hasActiveDataCatalogFacets(facets))
const showFacets = computed(() =>
    facetOptions.value.kinds.length > 0
    || facetOptions.value.connections.length > 0
    || facetOptions.value.owners.length > 0
    || facetOptions.value.tags.length > 0
    || facetsActive.value,
)
const showLoadMore = computed(() => hasMore.value)

const rows = computed(() =>
    hits.value.map((hit) => ({
        id: discoveryHitRowKey(hit),
        kind: hit.kind,
        name: hit.name,
        qualifiedLabel: hit.qualifiedLabel,
        connectionLabel: hit.connectionLabel,
        database: hit.database,
        owner: hit.owner ?? '',
        tags: (hit.tags ?? []).join(', '),
        subtitle: hit.subtitle ?? '',
        score: hit.score,
        _hit: hit,
    })),
)

const columns = computed<DwDataGridColumn<(typeof rows.value)[number]>[]>(() => [
    {key: 'kind', label: t('discovery.columns.kind'), mono: true},
    {key: 'name', label: t('discovery.columns.name'), mono: true},
    {key: 'qualifiedLabel', label: t('discovery.columns.qualified')},
    {key: 'connectionLabel', label: t('discovery.columns.connection')},
    {key: 'database', label: t('discovery.columns.database')},
    {key: 'owner', label: t('discovery.columns.owner')},
    {key: 'tags', label: t('discovery.columns.tags')},
    {key: 'subtitle', label: t('discovery.columns.subtitle')},
    {key: 'score', label: t('discovery.columns.score'), align: 'right'},
])

const gridLabels = computed<Partial<DwDataGridLabels>>(() => ({
    empty: debouncedQuery.value.trim().length < 2
        ? (hits.value.length ? t('discovery.emptyFacets') : t('discovery.emptyBrowse'))
        : facetsActive.value
            ? t('discovery.emptyFacets')
            : t('discovery.empty'),
    noMatch: facetsActive.value ? t('discovery.emptyFacets') : t('discovery.empty'),
    loading: t('discovery.loading'),
}))

const selectedHit = computed(() => {
    const key = selectedKeys.value.length === 1 ? selectedKeys.value[0] : null
    if (!key) return null
    return rows.value.find((row) => row.id === key)?._hit ?? null
})

const canOpen = computed(() => Boolean(selectedHit.value))
const canLineage = computed(() => canJumpLineage(selectedHit.value))
const showColumnPeek = computed(() =>
    selectedHit.value?.kind === 'table' || selectedHit.value?.kind === 'view',
)
const columnPeek = computed(() =>
    resolveDiscoveryHitColumnPeek(selectedHit.value, explorer.tree),
)

function resetFacets() {
    facets.kinds = []
    facets.connectionIds = []
    facets.owners = []
    facets.tags = []
}

function toggleKind(kind: DiscoveryFacetKind) {
    facets.kinds = toggleFacetValue(facets.kinds, kind)
    selectedKeys.value = []
    void fetchPage(0, false)
}

function toggleConnection(connectionId: string) {
    facets.connectionIds = toggleFacetValue(facets.connectionIds, connectionId)
    selectedKeys.value = []
    void fetchPage(0, false)
}

function toggleOwner(owner: string) {
    facets.owners = toggleFacetValue(facets.owners, owner)
    selectedKeys.value = []
    void fetchPage(0, false)
}

function toggleTag(tag: string) {
    facets.tags = toggleFacetValue(facets.tags, tag)
    selectedKeys.value = []
    void fetchPage(0, false)
}

function clearFacets() {
    resetFacets()
    selectedKeys.value = []
    void fetchPage(0, false)
}

function kindLabel(kind: string) {
    const key = `discovery.kinds.${kind}`
    return t(key) !== key ? t(key) : kind
}

async function fetchPage(offset: number, append: boolean) {
    const seq = ++searchSeq
    if (append) {
        loadingMore.value = true
    } else {
        loading.value = true
        loadingMore.value = false
    }
    error.value = ''
    try {
        const page = await platformApi.searchDiscovery(
            activeQuery,
            DATA_CATALOG_PAGE_SIZE,
            offset,
            toDiscoverySearchFilters(facets),
        )
        if (seq !== searchSeq) return
        hits.value = append ? [...hits.value, ...page.hits] : page.hits
        totalHits.value = page.total
        hasMore.value = nextDiscoveryOffset({
            offset: page.offset,
            hits: page.hits,
            hasMore: page.hasMore,
        }) != null
        if (page.facets) {
            serverFacets.value = page.facets
        }
        if (!append) {
            selectedKeys.value = []
        }
    } catch (err) {
        if (seq !== searchSeq) return
        error.value = resolveCaughtApiErrorMessage(err, t, 'workspace.metadoc.loadFailed')
        if (!append) {
            hits.value = []
            totalHits.value = 0
            hasMore.value = false
            serverFacets.value = null
        }
    } finally {
        if (seq === searchSeq) {
            loading.value = false
            loadingMore.value = false
        }
    }
}

async function runSearch(raw: string) {
    const q = raw.trim()
    const browse = q.length < 2
    activeQuery = browse ? '' : q
    resetFacets()
    await fetchPage(0, false)
}

async function loadMore() {
    if (!hasMore.value || loading.value || loadingMore.value) return
    await fetchPage(hits.value.length, true)
}

watch(debouncedQuery, (value) => {
    void runSearch(value)
})

onMounted(() => {
    void runSearch(query.value)
})

async function openSelected() {
    const hit = selectedHit.value
    if (!hit) return
    const [entry] = discoveryHitsToSearchEntries([hit])
    if (!entry) return
    await activateGlobalObjectSearchEntry(entry)
}

async function openLineageForHit(hit: DiscoveryHit) {
    lineageSource.value = hit
    lineageRelatedOverride.value = null
    if (needsRelatedTablePicker(hit)) {
        relatedTableCandidates.value = listRelatedTableChoices(hit)
        relatedTableOpen.value = true
        return
    }
    await runLineageImpact(hit, null)
}

async function chooseRelatedTable(choice: RelatedTableChoice) {
    const hit = lineageSource.value
    if (!hit) return
    relatedTableOpen.value = false
    lineageRelatedOverride.value = choice.raw
    await runLineageImpact(hit, choice.raw)
}

async function runLineageImpact(hit: DiscoveryHit, relatedTable: string | null) {
    const source = resolveLineageImpactSource(hit, relatedTable)
    if (!source) {
        if (hit.kind === 'metric') {
            layout.showWarningToast(t('discovery.lineageMetricNoTables'))
        }
        return
    }
    lineageLoading.value = true
    lineageSource.value = hit
    try {
        const impact = await lineageApi.getImpact({
            connectionId: source.connectionId,
            instanceName: source.database,
            name: source.name,
        })
        const preferred = hit.kind === 'metric' ? source.name : hit.name
        const auto = pickLineageJumpTarget(impact.downstream, preferred)
        if (auto) {
            workspace.openViewModelLineage({
                viewModelName: auto.modelName,
                connectionId: source.connectionId,
                database: source.database,
            })
            return
        }
        if (!impact.downstream.length) {
            layout.showWarningToast(t('discovery.lineageEmpty'))
            return
        }
        lineageCandidates.value = [...impact.downstream]
        lineageOpen.value = true
    } catch (err) {
        layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'lineage.loadFailed'))
    } finally {
        lineageLoading.value = false
    }
}

async function openLineageSelected() {
    const hit = selectedHit.value
    if (!hit) return
    await openLineageForHit(hit)
}

function chooseLineageTarget(item: LineageImpactItem) {
    const hit = lineageSource.value
    if (!hit) return
    const source = resolveLineageImpactSource(hit, lineageRelatedOverride.value)
    lineageOpen.value = false
    workspace.openViewModelLineage({
        viewModelName: item.modelName,
        connectionId: source?.connectionId ?? hit.connectionId,
        database: source?.database ?? hit.database,
    })
}
</script>

<template>
  <div class="data-catalog dw-workbench-page" data-wb-recipe="wb-extension">
    <header class="data-catalog__header">
      <div>
        <h2 class="data-catalog__title">{{ t('discovery.tabTitle') }}</h2>
        <p class="data-catalog__sub">{{ t('discovery.subtitle') }}</p>
        <p v-if="debouncedQuery.trim().length < 2 && hits.length" class="data-catalog__browse">
          {{ t('discovery.browseHint') }}
          <span v-if="totalHits > 0" class="data-catalog__count">
            {{ t('discovery.loadedCount', {loaded: hits.length, total: totalHits}) }}
          </span>
        </p>
        <p v-else-if="hits.length && totalHits > hits.length" class="data-catalog__browse">
          {{ t('discovery.loadedCount', {loaded: hits.length, total: totalHits}) }}
        </p>
      </div>
      <div class="data-catalog__search">
        <SearchInput
            v-model="query"
            :placeholder="t('discovery.searchPlaceholder')"
        />
      </div>
    </header>

    <section v-if="showFacets" class="data-catalog__facets" aria-label="Facets">
      <div v-if="facetOptions.kinds.length" class="data-catalog__facet-row">
        <span class="data-catalog__facet-label">{{ t('discovery.facets.kind') }}</span>
        <button
            v-for="option in facetOptions.kinds"
            :key="'kind:' + option.value"
            type="button"
            class="data-catalog__chip"
            :class="{ 'is-active': facets.kinds.includes(option.value as DiscoveryFacetKind) }"
            @click="toggleKind(option.value as DiscoveryFacetKind)"
        >
          {{ kindLabel(option.value) }}
          <span class="data-catalog__chip-count">{{ option.count }}</span>
        </button>
      </div>
      <div v-if="facetOptions.connections.length" class="data-catalog__facet-row">
        <span class="data-catalog__facet-label">{{ t('discovery.facets.connection') }}</span>
        <button
            v-for="option in facetOptions.connections"
            :key="'conn:' + option.value"
            type="button"
            class="data-catalog__chip"
            :class="{ 'is-active': facets.connectionIds.includes(option.value) }"
            @click="toggleConnection(option.value)"
        >
          {{ option.label }}
          <span class="data-catalog__chip-count">{{ option.count }}</span>
        </button>
      </div>
      <div v-if="facetOptions.owners.length" class="data-catalog__facet-row">
        <span class="data-catalog__facet-label">{{ t('discovery.facets.owner') }}</span>
        <button
            v-for="option in facetOptions.owners"
            :key="'owner:' + option.value"
            type="button"
            class="data-catalog__chip"
            :class="{ 'is-active': facets.owners.includes(option.value) }"
            @click="toggleOwner(option.value)"
        >
          {{ option.label }}
          <span class="data-catalog__chip-count">{{ option.count }}</span>
        </button>
      </div>
      <div v-if="facetOptions.tags.length" class="data-catalog__facet-row">
        <span class="data-catalog__facet-label">{{ t('discovery.facets.tag') }}</span>
        <button
            v-for="option in facetOptions.tags"
            :key="'tag:' + option.value"
            type="button"
            class="data-catalog__chip"
            :class="{ 'is-active': facets.tags.includes(option.value) }"
            @click="toggleTag(option.value)"
        >
          {{ option.label }}
          <span class="data-catalog__chip-count">{{ option.count }}</span>
        </button>
      </div>
      <button
          v-if="facetsActive"
          type="button"
          class="dw-text-btn data-catalog__clear-facets"
          @click="clearFacets"
      >
        {{ t('discovery.facets.clear') }}
      </button>
    </section>

    <div class="data-catalog__body">
      <div class="data-catalog__main">
        <DwDataGrid
            v-model:selected-keys="selectedKeys"
            :rows="rows"
            :columns="columns"
            row-key="id"
            :loading="loading || lineageLoading"
            :error="error"
            :labels="gridLabels"
            :show-search="false"
            :column-filter="false"
        >
          <template #toolbar-actions>
            <button type="button" :disabled="!canOpen || loading" @click="openSelected">
              <DwIcon name="table" size="sm" :stroke-width="1.35"/>
              {{ t('discovery.open') }}
            </button>
            <button type="button" :disabled="!canLineage || loading || lineageLoading" @click="openLineageSelected">
              <DwIcon name="explain" size="sm" :stroke-width="1.35"/>
              {{ t('discovery.openLineage') }}
            </button>
          </template>
        </DwDataGrid>

        <div v-if="showLoadMore" class="data-catalog__more">
          <DwButton
              variant="secondary"
              :disabled="loading || loadingMore"
              @click="loadMore"
          >
            {{ loadingMore ? t('discovery.loadingMore') : t('discovery.loadMore') }}
          </DwButton>
        </div>
      </div>

      <SidePanel
          v-if="showColumnPeek && selectedHit"
          class="data-catalog__peek"
          :title="t('discovery.columnPeek.title')"
          :subtitle="selectedHit.qualifiedLabel"
          border="left"
      >
        <p v-if="selectedHit.subtitle" class="data-catalog__peek-note">
          {{ selectedHit.subtitle }}
        </p>
        <ul v-if="columnPeek.length" class="data-catalog__peek-list">
          <li v-for="column in columnPeek" :key="column.name">
            <span class="data-catalog__peek-name">{{ column.name }}</span>
            <span v-if="column.type" class="data-catalog__peek-type">{{ column.type }}</span>
          </li>
        </ul>
        <EmptyState
            v-else
            class="data-catalog__peek-empty"
            embedded
            compact
            :title="t('discovery.columnPeek.empty')"
        />
      </SidePanel>
    </div>

    <AppModal
        :open="relatedTableOpen"
        :title="t('discovery.relatedTablePickTitle')"
        width="420px"
        @close="relatedTableOpen = false"
    >
      <p class="data-catalog__hint">{{ t('discovery.relatedTablePickHint') }}</p>
      <ul class="data-catalog__lineage-list">
        <li v-for="item in relatedTableCandidates" :key="item.raw">
          <button type="button" class="dw-text-btn" @click="chooseRelatedTable(item)">
            {{ item.label }}
            <span v-if="item.label !== item.name" class="data-catalog__stale">→ {{ item.name }}</span>
          </button>
        </li>
      </ul>
      <template #footer>
        <DwButton variant="secondary" @click="relatedTableOpen = false">
          {{ t('common.cancel') }}
        </DwButton>
      </template>
    </AppModal>

    <AppModal
        :open="lineageOpen"
        :title="t('discovery.lineagePickTitle')"
        width="420px"
        @close="lineageOpen = false"
    >
      <p class="data-catalog__hint">{{ t('discovery.lineagePickHint') }}</p>
      <ul class="data-catalog__lineage-list">
        <li v-for="item in lineageCandidates" :key="item.modelName + item.fileName">
          <button type="button" class="dw-text-btn" @click="chooseLineageTarget(item)">
            {{ item.modelName }}
            <span v-if="item.staleSidecar" class="data-catalog__stale">{{ t('discovery.lineageStale') }}</span>
          </button>
        </li>
      </ul>
      <template #footer>
        <DwButton variant="secondary" @click="lineageOpen = false">
          {{ t('common.cancel') }}
        </DwButton>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.data-catalog {
  gap: var(--dw-gap-md);
  min-height: 0;
  min-width: 0;
  padding: var(--dw-wb-content-pad-y) var(--dw-wb-content-pad-x);
}

.data-catalog__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.data-catalog__title {
  margin: 0;
  font-size: var(--dw-text-lg);
  font-weight: 600;
}

.data-catalog__sub {
  margin: var(--dw-space-2) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.data-catalog__browse {
  margin: var(--dw-space-3) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.data-catalog__count {
  margin-left: var(--dw-space-2);
}

.data-catalog__more {
  display: flex;
  justify-content: center;
  padding: var(--dw-space-2) 0 var(--dw-space-4);
}

.data-catalog__search {
  min-width: min(360px, 100%);
  flex: 1;
  max-width: 420px;
}

.data-catalog__body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 0;
}

.data-catalog__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 0;
}

.data-catalog__peek {
  width: min(280px, 34%);
  flex-shrink: 0;
}

.data-catalog__peek-note {
  margin: 0 0 10px;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: 1.4;
}

.data-catalog__peek-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.data-catalog__peek-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--dw-text-xs);
  line-height: 1.35;
}

.data-catalog__peek-name {
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  color: var(--dw-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-catalog__peek-type {
  flex-shrink: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
}

.data-catalog__peek-empty {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.data-catalog__facets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-catalog__facet-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.data-catalog__facet-label {
  min-width: 4.5rem;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.data-catalog__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-surface);
  color: var(--dw-text);
  font-size: var(--dw-text-xs);
  line-height: 1;
  padding: var(--dw-space-2) var(--dw-space-5);
  cursor: pointer;
}

.data-catalog__chip:hover {
  border-color: var(--dw-accent);
}

.data-catalog__chip.is-active {
  border-color: var(--dw-accent);
  background: color-mix(in srgb, var(--dw-accent) 12%, transparent);
  color: var(--dw-accent);
}

.data-catalog__chip-count {
  color: var(--dw-text-muted);
  font-variant-numeric: tabular-nums;
}

.data-catalog__chip.is-active .data-catalog__chip-count {
  color: inherit;
  opacity: 0.8;
}

.data-catalog__clear-facets {
  align-self: flex-start;
  font-size: var(--dw-text-xs);
}

.data-catalog__hint {
  margin: 0 0 12px;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.data-catalog__lineage-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.data-catalog__stale {
  margin-left: 8px;
  color: var(--dw-warning);
  font-size: var(--dw-text-2xs);
}
</style>

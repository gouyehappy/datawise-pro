<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {datasourcesApi} from '@/api'
import SearchInput from '@/core/components/SearchInput.vue'
import {DwButton, DwSelect, EmptyState, ModuleHeroSettingsMenu, ModulePageHeader, MpJourneyStrip, type ModuleHeroMenuItem} from '@/core/components'
import {DwIcon} from '@/core/icons'
import ConnectorMarketCard from '@/features/plugin/components/ConnectorMarketCard.vue'
import ConnectorMarketDetailPanel from '@/features/plugin/components/ConnectorMarketDetailPanel.vue'
import type {ConnectorMarketEntry} from '@/features/datasource/types/datasource.types'
import {
    fetchConnectorMarketBundle,
    filterConnectorMarketEntries,
    summarizeConnectorMarket,
} from '@/features/datasource/services/connector-market.service'
import {
    isQuarantinedPluginFailure,
    pluginFailureReasonKey,
    pluginFailureTipKey,
    type ConnectorPluginLoadFailure,
} from '@/features/datasource/services/connector-plugin-failure.service'
import {
    countEntriesByCategory,
    filterEntriesByCategory,
    visibleCategoriesForEntries,
} from '@/features/datasource/services/connector-market-category.service'
import type {DbTypeCategoryKey} from '@/features/connection/constants/db-type-categories'
import {
    defaultConnectorMarketOrder,
    mergeConnectorMarketOrder,
    moveConnectorInOrder,
    readMarketCustomOrder,
    readMarketSortMode,
    readMarketViewMode,
    resolveConnectorCardSize,
    sortConnectorMarketEntries,
    writeMarketCustomOrder,
    writeMarketSortMode,
    writeMarketViewMode,
    type ConnectorMarketSortMode,
    type ConnectorMarketViewMode,
} from '@/features/datasource/services/connector-market-layout.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {CORE_CONNECTOR_IDS} from '@/features/settings/services/runtime-format.service'
import type {SelectOption} from '@/core/components/select.types'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

type AvailabilityFilter = 'all' | 'ready' | 'pending'
type CategoryFilter = DbTypeCategoryKey | 'all'

const props = withDefaults(defineProps<{
    compact?: boolean
    standalone?: boolean
}>(), {
    compact: false,
    standalone: false,
})

const {t} = useI18n()
const layout = useLayoutStore()
const auth = useAuthStore()
const entitlement = useEntitlementStore()
const loading = ref(false)
const reloading = ref(false)
const installingCore = ref(false)
const cleaningRedundant = ref(false)
const error = ref<string | null>(null)
const search = ref('')
const availability = ref<AvailabilityFilter>('all')
const activeCategory = ref<CategoryFilter>('all')
const entries = ref<ConnectorMarketEntry[]>([])
const loadedPluginJars = ref<string[]>([])
const pluginLoadFailures = ref<ConnectorPluginLoadFailure[]>([])
const clearingQuarantine = ref(false)
const manifestSummary = ref<{schemaVersion: number; updatedAt?: string; channel?: string; pluginCount: number} | null>(null)
const runtimeExpanded = ref(false)
const sortMode = ref<ConnectorMarketSortMode>(readMarketSortMode())
const viewMode = ref<ConnectorMarketViewMode>(readMarketViewMode())
const customOrder = ref<string[]>(readMarketCustomOrder())
const draggingId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const selectedId = ref<string | null>(null)

onMounted(() => {
    void loadMarket()
})

async function loadMarket(options?: {quiet?: boolean}) {
    const quiet = Boolean(options?.quiet)
    if (!quiet) {
        loading.value = true
        error.value = null
    }
    try {
        const bundle = await fetchConnectorMarketBundle()
        // Patch in place to avoid remounting the whole board (less flicker).
        entries.value = bundle.connectors
        loadedPluginJars.value = bundle.loadedPluginJars
        pluginLoadFailures.value = bundle.pluginLoadFailures ?? []
        manifestSummary.value = bundle.manifest ?? null
        customOrder.value = mergeConnectorMarketOrder(customOrder.value, bundle.connectors)
        if (quiet) error.value = null
    } catch (err) {
        if (!quiet) {
            error.value = resolveCaughtApiErrorMessage(err, t, 'plugin.connectorMarket.loadFailed')
        } else {
            layout.showErrorToast(
                resolveCaughtApiErrorMessage(err, t, 'plugin.connectorMarket.loadFailed'),
            )
        }
    } finally {
        if (!quiet) loading.value = false
    }
}

function refreshMarketQuiet() {
    void loadMarket({quiet: true})
}

const summary = computed(() => summarizeConnectorMarket(entries.value))

const categorySummary = computed(() =>
    countEntriesByCategory(entries.value, activeCategory.value),
)

const visibleCategories = computed(() => visibleCategoriesForEntries(entries.value))

watch(visibleCategories, (cats) => {
    if (activeCategory.value === 'all') return
    if (!cats.some((cat) => cat.key === activeCategory.value)) {
        activeCategory.value = 'all'
    }
})

const readinessPercent = computed(() => {
    if (!summary.value.total) return 0
    return Math.round((summary.value.available / summary.value.total) * 100)
})

const filteredEntries = computed(() => {
    let list = filterEntriesByCategory(entries.value, activeCategory.value)
    list = filterConnectorMarketEntries(list, search.value)
    if (availability.value === 'ready') {
        list = list.filter((entry) => entry.available)
    } else if (availability.value === 'pending') {
        list = list.filter((entry) => !entry.available)
    }
    return sortConnectorMarketEntries(list, sortMode.value, customOrder.value)
})

const boardTiles = computed(() =>
    filteredEntries.value.map((entry, index) => ({
        entry,
        size: resolveConnectorCardSize(entry, index, {
            standalone: props.standalone,
            // List/master-detail only applies on the standalone market page.
            viewMode: props.standalone ? viewMode.value : 'grid',
        }),
    })),
)

const splitMode = computed(() => props.standalone && viewMode.value === 'list')

const selectedEntry = computed(() => {
    if (!selectedId.value) return filteredEntries.value[0] ?? null
    return filteredEntries.value.find((entry) => entry.id === selectedId.value)
        ?? filteredEntries.value[0]
        ?? null
})

watch(filteredEntries, (list) => {
    if (!list.length) {
        selectedId.value = null
        return
    }
    if (!selectedId.value || !list.some((entry) => entry.id === selectedId.value)) {
        selectedId.value = list[0]!.id
    }
}, {immediate: true})

function onSelectEntry(id: string) {
    selectedId.value = id
}

const showFailureBanner = computed(
    () => !loading.value && !error.value && pluginLoadFailures.value.length > 0,
)

const showPendingBanner = computed(
    () => props.standalone
        && !loading.value
        && !error.value
        && summary.value.pending > 0
        && availability.value !== 'pending',
)

const filterOptions: AvailabilityFilter[] = ['all', 'ready', 'pending']

function selectCategory(key: CategoryFilter) {
    activeCategory.value = key
}

function categoryCount(key: CategoryFilter): number {
    return countEntriesByCategory(entries.value, key).total
}

const sortOptions = computed<SelectOption[]>(() => [
    {value: 'featured', label: t('plugin.connectorMarket.sort.featured')},
    {value: 'name', label: t('plugin.connectorMarket.sort.name')},
    {value: 'status', label: t('plugin.connectorMarket.sort.status')},
    {value: 'custom', label: t('plugin.connectorMarket.sort.custom')},
])

const reorderable = computed(() => props.standalone && !loading.value && !error.value)

function filterLabel(key: AvailabilityFilter): string {
    return t(`plugin.connectorMarket.filter.${key}`)
}

function onSortModeChange(mode: string) {
    const next = mode as ConnectorMarketSortMode
    sortMode.value = next
    writeMarketSortMode(next)
    if (next === 'custom' && customOrder.value.length === 0) {
        customOrder.value = defaultConnectorMarketOrder(entries.value)
        writeMarketCustomOrder(customOrder.value)
    }
}

function setViewMode(mode: ConnectorMarketViewMode) {
    viewMode.value = mode
    writeMarketViewMode(mode)
}

function focusPending() {
    availability.value = 'pending'
    search.value = ''
}

function onCardDragStart(id: string) {
    draggingId.value = id
    if (sortMode.value !== 'custom') {
        sortMode.value = 'custom'
        writeMarketSortMode('custom')
        customOrder.value = mergeConnectorMarketOrder(
            customOrder.value.length ? customOrder.value : defaultConnectorMarketOrder(entries.value),
            entries.value,
        )
        writeMarketCustomOrder(customOrder.value)
    }
}

function onCardDragOver(id: string) {
    if (!draggingId.value || draggingId.value === id) return
    dropTargetId.value = id
}

function onCardDrop(toId: string) {
    const fromId = draggingId.value
    dropTargetId.value = null
    draggingId.value = null
    if (!fromId || fromId === toId) return
    const next = moveConnectorInOrder(
        mergeConnectorMarketOrder(customOrder.value, entries.value),
        fromId,
        toId,
    )
    customOrder.value = next
    writeMarketCustomOrder(next)
    sortMode.value = 'custom'
    writeMarketSortMode('custom')
}

function onCardDragEnd() {
    draggingId.value = null
    dropTargetId.value = null
}

async function reloadPlugins() {
    if (reloading.value || loading.value) return
    reloading.value = true
    try {
        const result = await datasourcesApi.reloadPlugins()
        layout.showSuccessToast(t('plugin.connectorMarket.reloadSuccess', {
            jars: result.loadedJarCount,
            connectors: result.loadedConnectorIds?.length ?? 0,
        }))
        if (result.failures?.length) {
            layout.showWarningToast(t('plugin.connectorMarket.reloadPartial', {
                count: result.failures.length,
            }))
        }
        await loadMarket()
    } catch (err) {
        layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'plugin.connectorMarket.reloadFailed'))
    } finally {
        reloading.value = false
    }
}

async function clearQuarantine() {
    if (!auth.isAdmin || clearingQuarantine.value || loading.value) return
    clearingQuarantine.value = true
    try {
        await datasourcesApi.clearQuarantinedPlugins()
        layout.showSuccessToast(t('plugin.connectorMarket.clearQuarantineSuccess'))
        await loadMarket()
    } catch (err) {
        layout.showErrorToast(
            resolveCaughtApiErrorMessage(err, t, 'plugin.connectorMarket.clearQuarantineFailed'),
        )
    } finally {
        clearingQuarantine.value = false
    }
}

function failureReasonLabel(reason: string) {
    return t(pluginFailureReasonKey(reason))
}

function failureTipLabel(reason: string) {
    return t(pluginFailureTipKey(reason))
}

async function installCoreConnectors() {
    if (!auth.isAdmin || installingCore.value || loading.value) return
    const pendingCore = entries.value
        .filter((entry) =>
            (CORE_CONNECTOR_IDS as readonly string[]).includes(entry.id)
            && !entry.available
            && entry.downloadUrl?.trim(),
        )
        .map((entry) => entry.id)
    if (!pendingCore.length) {
        layout.showToast(t('plugin.connectorMarket.installCoreSuccess', {count: 0}))
        return
    }
    installingCore.value = true
    try {
        const {installConnectorsWithDrivers, countSuccessfulConnectorInstalls} = await import(
            '@/features/settings/services/install-connectors-with-drivers.service'
        )
        const result = await installConnectorsWithDrivers(pendingCore, {withDrivers: true})
        const ok = countSuccessfulConnectorInstalls(result.connectors.results)
        layout.showSuccessToast(t('plugin.connectorMarket.installCoreSuccess', {count: ok}))
        await loadMarket()
    } catch (err) {
        layout.showErrorToast(
            resolveCaughtApiErrorMessage(err, t, 'plugin.connectorMarket.installCoreFailed'),
        )
    } finally {
        installingCore.value = false
    }
}

async function cleanupRedundantPlugins() {
    if (!auth.isAdmin || cleaningRedundant.value || loading.value) return
    cleaningRedundant.value = true
    try {
        const result = await datasourcesApi.cleanupRedundantPlugins()
        layout.showSuccessToast(t('plugin.connectorMarket.cleanupRedundantSuccess', {
            count: result.deletedCount,
        }))
        await loadMarket()
    } catch (err) {
        layout.showErrorToast(
            resolveCaughtApiErrorMessage(err, t, 'plugin.connectorMarket.cleanupRedundantFailed'),
        )
    } finally {
        cleaningRedundant.value = false
    }
}

const heroMenuItems = computed<ModuleHeroMenuItem[]>(() => {
    const items: ModuleHeroMenuItem[] = [
        {
            id: 'refresh',
            label: t('plugin.connectorMarket.refresh'),
            icon: 'refresh',
            disabled: loading.value || reloading.value,
        },
        {
            id: 'reload',
            label: reloading.value
                ? t('plugin.connectorMarket.reloading')
                : t('plugin.connectorMarket.reloadPlugins'),
            icon: 'run',
            disabled: loading.value || reloading.value,
        },
    ]
    if (auth.isAdmin) {
        items.push(
            {
                id: 'install-core',
                label: installingCore.value
                    ? t('plugin.connectorMarket.installingCore')
                    : t('plugin.connectorMarket.installCore'),
                icon: 'plugins',
                disabled: loading.value || reloading.value || installingCore.value,
                dividerBefore: true,
            },
            {
                id: 'cleanup',
                label: cleaningRedundant.value
                    ? t('plugin.connectorMarket.cleaningRedundant')
                    : t('plugin.connectorMarket.cleanupRedundant'),
                icon: 'delete',
                disabled: loading.value || reloading.value || cleaningRedundant.value,
            },
        )
    }
    return items
})

function onHeroMenuSelect(id: string) {
    if (id === 'refresh') {
        void loadMarket()
        return
    }
    if (id === 'reload') {
        void reloadPlugins()
        return
    }
    if (id === 'install-core') {
        void installCoreConnectors()
        return
    }
    if (id === 'cleanup') {
        void cleanupRedundantPlugins()
    }
}
</script>

<template>
  <div
      class="connector-market"
      :class="{
        'connector-market--compact': compact,
        'connector-market--page': standalone,
      }"
  >
    <ModulePageHeader
        v-if="standalone"
        content-class="connector-market-hero"
        :title="t('plugin.connectorMarket.title')"
        :eyebrow="t('plugin.connectorMarket.eyebrow')"
        :subtitle="t('plugin.connectorMarket.subtitle')"
    >
      <template #settings>
        <ModuleHeroSettingsMenu
            :ariaLabel="t('plugin.connectorMarket.settingsMenu.aria')"
            :items="heroMenuItems"
            :active="reloading || installingCore || cleaningRedundant"
            @select="onHeroMenuSelect"
        />
      </template>
    </ModulePageHeader>

    <MpJourneyStrip
        v-if="standalone && entitlement.mode === 'enforced'"
        :note-title="t('plugin.connectorMarket.tier.title')"
        :note-body="t('plugin.connectorMarket.tier.body')"
    />

    <div v-if="!standalone" class="connector-market__head">
      <div>
        <h3 class="connector-market__title">{{ t('plugin.connectorMarket.title') }}</h3>
        <p class="connector-market__sub">{{ t('plugin.connectorMarket.subtitle') }}</p>
      </div>
    </div>

    <section
        v-if="standalone && !loading && !error"
        class="mp-status"
        :aria-label="t('plugin.connectorMarket.statusAria')"
    >
      <div class="mp-status__item">
        <span class="mp-status__label">{{ t('plugin.connectorMarket.filter.all') }}</span>
        <strong class="mp-status__value">{{ categorySummary.total }}</strong>
      </div>
      <div class="mp-status__item">
        <span class="mp-status__label">{{ t('plugin.connectorMarket.filter.ready') }}</span>
        <strong class="mp-status__value">{{ categorySummary.available }}</strong>
      </div>
      <div class="mp-status__item">
        <span class="mp-status__label">{{ t('plugin.connectorMarket.filter.pending') }}</span>
        <strong class="mp-status__value">{{ categorySummary.pending }}</strong>
      </div>
      <div class="mp-status__item mp-status__item--grow">
        <div class="mp-status__readiness-row">
          <span class="mp-status__label">{{ t('plugin.connectorMarket.readinessShort') }}</span>
          <strong class="mp-status__value mp-status__value--sm">{{ readinessPercent }}%</strong>
        </div>
        <div class="mp-status__bar" aria-hidden="true">
          <span :style="{width: `${readinessPercent}%`}"/>
        </div>
        <span v-if="manifestSummary" class="mp-status__meta">
          {{ t('plugin.connectorMarket.manifestSummary', {
            count: manifestSummary.pluginCount,
            channel: manifestSummary.channel || t('plugin.connectorMarket.manifestChannelLocal'),
          }) }}
        </span>
      </div>
    </section>

    <div
        v-if="showPendingBanner"
        class="connector-market-pending-alert"
        role="status"
    >
      <div class="connector-market-pending-alert__copy">
        <strong>{{ t('plugin.connectorMarket.pendingBannerTitle', {count: summary.pending}) }}</strong>
        <p>{{ t('plugin.connectorMarket.pendingBannerHint') }}</p>
      </div>
      <DwButton size="sm" @click="focusPending">
        {{ t('plugin.connectorMarket.pendingBannerAction') }}
      </DwButton>
    </div>

    <div
        v-if="showFailureBanner"
        class="connector-market-failure-alert"
        role="alert"
    >
      <div class="connector-market-failure-alert__copy">
        <strong>{{ t('plugin.connectorMarket.failureBannerTitle', {count: pluginLoadFailures.length}) }}</strong>
        <p>{{ t('plugin.connectorMarket.failureBannerHint') }}</p>
        <ul class="connector-market-failure-alert__list">
          <li v-for="failure in pluginLoadFailures.slice(0, 6)" :key="`${failure.jarName}-${failure.reason}`">
            <code>{{ failure.jarName }}</code>
            — {{ failureReasonLabel(failure.reason) }}
            <span class="connector-market-failure-alert__tip">{{ failureTipLabel(failure.reason) }}</span>
            <span
                v-if="isQuarantinedPluginFailure(failure.reason)"
                class="connector-market-failure-alert__tag"
            >quarantine</span>
          </li>
        </ul>
      </div>
      <div class="connector-market-failure-alert__actions">
        <DwButton size="sm" variant="secondary" :loading="reloading" @click="reloadPlugins">
          {{ t('plugin.connectorMarket.failureBannerReload') }}
        </DwButton>
        <DwButton
            v-if="auth.isAdmin"
            size="sm"
            :loading="clearingQuarantine"
            @click="clearQuarantine"
        >
          {{ t('plugin.connectorMarket.failureBannerClearQuarantine') }}
        </DwButton>
      </div>
    </div>

    <section class="connector-market-library" :class="{'connector-market-library--embed': !standalone}">
      <header v-if="standalone" class="connector-market-library__head">
        <div>
          <h2>{{ t('plugin.connectorMarket.libraryTitle') }}</h2>
          <p v-if="viewMode === 'grid'">{{ t('plugin.connectorMarket.libraryHint') }}</p>
          <p v-else>{{ t('plugin.connectorMarket.libraryHintList') }}</p>
        </div>
      </header>

      <div class="connector-market-toolbar">
        <div v-if="standalone" class="dw-segment dw-segment--sm connector-market-filters" role="tablist">
          <button
              v-for="option in filterOptions"
              :key="option"
              class="dw-segment__btn"
              :class="{'is-active': availability === option}"
              type="button"
              role="tab"
              :aria-selected="availability === option"
              @click="availability = option"
          >
            {{ filterLabel(option) }}
            <span v-if="option === 'all'" class="connector-market-filters__count">{{ categorySummary.total }}</span>
            <span v-else-if="option === 'ready'" class="connector-market-filters__count">{{ categorySummary.available }}</span>
            <span v-else-if="option === 'pending'" class="connector-market-filters__count">{{ categorySummary.pending }}</span>
          </button>
        </div>
        <div v-if="standalone" class="connector-market-toolbar__controls">
          <SearchInput
              v-model="search"
              class="connector-market-toolbar__search"
              size="sm"
              :placeholder="t('plugin.connectorMarket.searchPlaceholder')"
          >
            <template v-if="!loading && !error" #suffix>
              {{ t('plugin.connectorMarket.matchCount', {count: filteredEntries.length}) }}
            </template>
          </SearchInput>
          <DwSelect
              class="connector-market-toolbar__sort"
              v-model="sortMode"
              size="sm"
              :searchable="false"
              :options="sortOptions"
              :aria-label="t('plugin.connectorMarket.sort.label')"
              @update:model-value="onSortModeChange"
          />
          <div
              class="connector-market-view-toggle"
              role="group"
              :aria-label="t('plugin.connectorMarket.view.label')"
          >
            <button
                type="button"
                class="connector-market-view-toggle__btn"
                :class="{'is-active': viewMode === 'grid'}"
                :title="t('plugin.connectorMarket.view.grid')"
                :aria-pressed="viewMode === 'grid'"
                @click="setViewMode('grid')"
            >
              <DwIcon name="menu-group" size="sm" :stroke-width="2"/>
            </button>
            <button
                type="button"
                class="connector-market-view-toggle__btn"
                :class="{'is-active': viewMode === 'list'}"
                :title="t('plugin.connectorMarket.view.list')"
                :aria-pressed="viewMode === 'list'"
                @click="setViewMode('list')"
            >
              <DwIcon name="list-ordered" size="sm" :stroke-width="2"/>
            </button>
          </div>
        </div>
        <SearchInput
            v-else
            v-model="search"
            class="connector-market-toolbar__search connector-market-toolbar__search--solo"
            :placeholder="t('plugin.connectorMarket.searchPlaceholder')"
        />
      </div>

      <p
          v-if="standalone && reorderable && viewMode === 'grid' && !loading && !error"
          class="connector-market-reorder-hint"
      >
        {{ t('plugin.connectorMarket.reorderHint') }}
      </p>

      <div
          class="connector-market-browse"
          :class="{'connector-market-browse--with-nav': standalone && visibleCategories.length > 0}"
      >
        <nav
            v-if="standalone && visibleCategories.length > 0"
            class="connector-market-nav"
            :aria-label="t('plugin.connectorMarket.categoryNav')"
        >
          <button
              type="button"
              class="connector-market-nav__item"
              :class="{'is-active': activeCategory === 'all'}"
              :aria-current="activeCategory === 'all' ? 'page' : undefined"
              @click="selectCategory('all')"
          >
            <span>{{ t('plugin.connectorMarket.categoryAll') }}</span>
            <span class="connector-market-nav__count">{{ categoryCount('all') }}</span>
          </button>
          <button
              v-for="cat in visibleCategories"
              :key="cat.key"
              type="button"
              class="connector-market-nav__item"
              :class="{'is-active': activeCategory === cat.key}"
              :aria-current="activeCategory === cat.key ? 'page' : undefined"
              @click="selectCategory(cat.key)"
          >
            <span>{{ t(cat.titleKey) }}</span>
            <span class="connector-market-nav__count">{{ categoryCount(cat.key) }}</span>
          </button>
        </nav>

        <div class="connector-market-browse__body">
          <div v-if="loading" class="connector-market-skeleton" aria-busy="true">
            <div
                v-for="n in 6"
                :key="n"
                class="connector-market-skeleton__card"
                :class="`connector-market-skeleton__card--${n === 1 ? 'hero' : n % 3 === 0 ? 'tall' : 'standard'}`"
            />
          </div>

          <EmptyState
              v-else-if="error"
              embedded
              :title="t('plugin.connectorMarket.loadFailed')"
              :hint="error"
          />

          <EmptyState
              v-else-if="!boardTiles.length"
              embedded
              :title="t('plugin.connectorMarket.empty')"
              :hint="t('plugin.connectorMarket.emptyHint')"
          />

          <div
              v-else-if="splitMode"
              class="connector-market-split"
          >
            <div
                class="connector-market-split__list connector-market-board connector-market-board--list"
                role="listbox"
                :aria-label="t('plugin.connectorMarket.libraryTitle')"
            >
              <ConnectorMarketCard
                  v-for="(tile, index) in boardTiles"
                  :key="tile.entry.id"
                  :entry="tile.entry"
                  :index="index"
                  :size="tile.size"
                  :standalone="standalone"
                  selection-mode
                  :selected="selectedEntry?.id === tile.entry.id"
                  @select="onSelectEntry"
                  @installed="refreshMarketQuiet"
              />
            </div>
            <aside class="connector-market-split__detail" :aria-label="t('plugin.connectorMarket.detailTitle')">
              <ConnectorMarketDetailPanel
                  :entry="selectedEntry"
                  @installed="refreshMarketQuiet"
              />
            </aside>
          </div>

          <div
              v-else
              class="connector-market-board"
              :class="{
                'connector-market-board--dragging': !!draggingId,
              }"
          >
            <ConnectorMarketCard
                v-for="(tile, index) in boardTiles"
                :key="tile.entry.id"
                :entry="tile.entry"
                :index="index"
                :size="tile.size"
                :standalone="standalone"
                :reorderable="reorderable && viewMode === 'grid'"
                :dragging="draggingId === tile.entry.id"
                :drop-target="dropTargetId === tile.entry.id"
                @installed="refreshMarketQuiet"
                @drag-start="onCardDragStart"
                @drag-over="onCardDragOver"
                @drop="onCardDrop"
                @drag-end="onCardDragEnd"
            />
          </div>
        </div>
      </div>
    </section>

    <footer v-if="standalone && !loading" class="connector-market-runtime">
      <button
          class="connector-market-runtime__toggle"
          type="button"
          :aria-expanded="runtimeExpanded"
          @click="runtimeExpanded = !runtimeExpanded"
      >
        <DwIcon name="connectors" size="sm" :stroke-width="1.6"/>
        <span>
          {{
            loadedPluginJars.length
                ? t('plugin.connectorMarket.loadedJars', {count: loadedPluginJars.length})
                : t('plugin.connectorMarket.noRuntimeJars')
          }}
        </span>
        <DwIcon
            name="chevron-left"
            class="connector-market-runtime__chevron"
            :class="{'is-open': runtimeExpanded}"
            size="sm"
            :stroke-width="2"
        />
      </button>
      <ul v-if="runtimeExpanded && loadedPluginJars.length" class="connector-market-runtime__list">
        <li v-for="jar in loadedPluginJars" :key="jar">{{ jar }}</li>
      </ul>
      <EmptyState
          v-else-if="runtimeExpanded"
          embedded
          compact
          class="connector-market-runtime__empty"
          :title="t('plugin.connectorMarket.noRuntimeJarsHint')"
      />
    </footer>
  </div>
</template>

<style scoped>
.connector-market__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-6);
  margin-bottom: var(--dw-space-6);
}

.connector-market__title {
  margin: 0;
  font-size: var(--dw-text-lg);
  font-weight: 600;
}

.connector-market__sub {
  margin: var(--dw-space-2) 0 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.connector-market-failure-alert {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-4);
  margin: 0 0 var(--dw-space-4);
  padding: var(--dw-space-3) var(--dw-space-4);
  border: 1px solid color-mix(in srgb, var(--dw-danger, #c0392b) 35%, var(--dw-border-light));
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-danger, #c0392b) 8%, var(--dw-bg));
}

.connector-market-failure-alert__copy {
  min-width: 0;
  flex: 1;
}

.connector-market-failure-alert__copy strong {
  display: block;
  margin-bottom: var(--dw-space-1);
}

.connector-market-failure-alert__copy p {
  margin: 0 0 var(--dw-space-2);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.connector-market-failure-alert__list {
  margin: 0;
  padding-left: 1.1rem;
  font-size: var(--dw-text-sm);
}

.connector-market-failure-alert__tip {
  display: block;
  margin-top: 2px;
  color: var(--dw-text-muted);
}

.connector-market-failure-alert__tag {
  display: inline-block;
  margin-left: var(--dw-space-2);
  padding: 0 6px;
  border-radius: 4px;
  font-size: var(--dw-font-size-badge);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: color-mix(in srgb, var(--dw-danger, #c0392b) 18%, transparent);
}

.connector-market-failure-alert__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-2);
  flex-shrink: 0;
}
</style>

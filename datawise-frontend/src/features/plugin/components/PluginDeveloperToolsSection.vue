<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState, ModuleHeroSettingsMenu, ModulePageHeader, MpJourneyStrip, SearchInput, StatusPill, type ModuleHeroMenuItem, type MpJourneyAction} from '@/core/components'
import type {PluginMatrixRow} from '@/features/plugin/services/plugin-matrix.service'
import type {ExplorerPluginCrossRefRow} from '@/features/plugin/services/plugin-connector-crossref.service'
import {
    CONNECTOR_CAPABILITY_DOC,
    formatConnectorCapabilityCrossRefLabel,
} from '@/features/plugin/services/plugin-connector-crossref.service'
import type {PluginHookTemplateId} from '@/features/plugin/services/plugin-hook-template.service'
import type {PluginHookName} from '@/features/plugin/types/plugin-hook.types'
import type {PluginId} from '@/features/plugin/services/plugin-registry.service'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {hasDevProductivityAccess} from '@/features/pack/services/dev-productivity-entitlement'

const CATEGORY_ORDER = ['ai', 'export', 'tool', 'datasource'] as const

export type PluginDevTab = 'matrix' | 'usage' | 'connectors' | 'audit' | 'hooks'

export interface PluginUsageLeaderboardRow {
    id: string
    total: number
    entry: {enable: number; disable: number}
}

export interface PluginHookRow {
    hook: PluginHookName
    pluginId: string
    known: boolean
}

export interface PluginJarFailure {
    jarName: string
    reason: string
}

export interface PluginCatalogIssue {
    kind: string
    id: string
    detail?: string
}

const props = defineProps<{
    matrixRows: PluginMatrixRow[]
    explorerCrossRefs: ExplorerPluginCrossRefRow[]
    usageLeaderboard: PluginUsageLeaderboardRow[]
    hookRows: PluginHookRow[]
    hookTemplateIds: PluginHookTemplateId[]
    catalogLoading: boolean
    catalogError: string | null
    loadedPluginJars: string[]
    pluginLoadFailures: PluginJarFailure[]
    catalogAuditIssues: PluginCatalogIssue[]
    catalogMetadataIssues: PluginCatalogIssue[]
    catalogAllIssueCount: number
    connectorJarCount: number
    referencePresetMismatchCount: number
    referencePresetLabel: string
    requiredPluginLabel: (id: PluginId) => string
    hookLabel: (hook: PluginHookName) => string
    hookTemplateLabel: (id: PluginHookTemplateId) => string
    catalogAuditKindLabel: (kind: string) => string
    catalogMetadataKindLabel: (kind: string) => string
    initialTab?: PluginDevTab
}>()

const emit = defineEmits<{
    exportMatrixCsv: []
    exportCatalogDiffCsv: []
    clearUsage: []
    copyCrossRefDoc: [path: string]
    copyHookTemplate: [id: PluginHookTemplateId]
    refreshHooks: []
    alignReferencePreset: []
    openPresetDiff: []
}>()

const {t} = useI18n()
const pluginStore = usePluginStore()
const entitlement = useEntitlementStore()

function hasDevAccess(): boolean {
    return hasDevProductivityAccess({
        mode: entitlement.mode,
        suiteId: entitlement.suiteId,
    })
}

const proUnlocked = computed(() => hasDevAccess())

function unlockProProductivity() {
    entitlement.openPaywall('pack.ai', 'dev.productivity')
}

const journeyActions = computed<MpJourneyAction[]>(() => {
    if (proUnlocked.value) return []
    return [
        {
            id: 'unlock',
            label: t('plugin.advanced.journey.unlockPro'),
            variant: 'primary',
            onClick: unlockProProductivity,
        },
    ]
})

function resolveInitialTab(): PluginDevTab {
    if (props.initialTab) return props.initialTab
    if (props.catalogAllIssueCount > 0 || props.referencePresetMismatchCount > 0) return 'audit'
    return 'matrix'
}

const activeTab = ref<PluginDevTab>(resolveInitialTab())

watch(() => pluginStore.devToolsTabRevision, () => {
    const tab = pluginStore.consumeDevToolsTabRequest()
    if (tab) activeTab.value = tab
})
const matrixSearch = ref('')
const matrixCategory = ref<'all' | (typeof CATEGORY_ORDER)[number]>('all')
const matrixView = ref<'cards' | 'table'>('cards')

const usageMaxTotal = computed(() =>
    Math.max(1, ...props.usageLeaderboard.map((row) => row.total)),
)

const filteredMatrixRows = computed(() => {
    let rows = props.matrixRows
    if (matrixCategory.value !== 'all') {
        rows = rows.filter((row) => row.category === matrixCategory.value)
    }
    const q = matrixSearch.value.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
        const haystack = [
            row.id,
            row.category,
            ...row.surfaces,
            ...row.requires,
            ...row.dbTypes,
        ].join(' ').toLowerCase()
        return haystack.includes(q)
    })
})

const matrixGrouped = computed(() => {
    const groups = new Map<string, PluginMatrixRow[]>()
    for (const cat of CATEGORY_ORDER) groups.set(cat, [])
    for (const row of filteredMatrixRows.value) {
        const list = groups.get(row.category) ?? []
        list.push(row)
        groups.set(row.category, list)
    }
    return CATEGORY_ORDER
        .map((cat) => ({category: cat, rows: groups.get(cat) ?? []}))
        .filter((group) => group.rows.length > 0)
})

const devTabs = computed(() => [
    {
        id: 'matrix' as const,
        label: t('plugin.advanced.tabs.matrix'),
        count: props.matrixRows.length,
        tone: 'sky' as const,
    },
    {
        id: 'usage' as const,
        label: t('plugin.advanced.tabs.usage'),
        count: props.usageLeaderboard.length,
        tone: 'violet' as const,
    },
    {
        id: 'connectors' as const,
        label: t('plugin.advanced.tabs.connectors'),
        count: props.connectorJarCount,
        tone: 'emerald' as const,
    },
    {
        id: 'audit' as const,
        label: t('plugin.advanced.tabs.audit'),
        count: props.catalogAllIssueCount + props.referencePresetMismatchCount,
        tone: (props.catalogAllIssueCount + props.referencePresetMismatchCount) > 0 ? 'amber' as const : 'neutral' as const,
    },
    {
        id: 'hooks' as const,
        label: t('plugin.advanced.tabs.hooks'),
        count: props.hookRows.length,
        tone: 'rose' as const,
    },
])

function selectTab(id: PluginDevTab) {
    activeTab.value = id
}

function usageBarWidth(total: number): string {
    return `${Math.round((total / usageMaxTotal.value) * 100)}%`
}

const heroMenuItems = computed<ModuleHeroMenuItem[]>(() => [
    {
        id: 'export-matrix',
        label: t('plugin.matrix.exportCsv'),
        icon: 'export',
    },
    {
        id: 'export-catalog',
        label: t('plugin.catalogAudit.exportDiffCsv'),
        icon: 'export',
    },
    {
        id: 'refresh-hooks',
        label: t('plugin.hooks.refresh'),
        icon: 'refresh',
        dividerBefore: true,
    },
    {
        id: 'clear-usage',
        label: t('plugin.usage.clear'),
        icon: 'delete',
    },
])

function onHeroMenuSelect(id: string) {
    if (id === 'export-matrix') {
        emit('exportMatrixCsv')
        return
    }
    if (id === 'export-catalog') {
        emit('exportCatalogDiffCsv')
        return
    }
    if (id === 'refresh-hooks') {
        emit('refreshHooks')
        return
    }
    if (id === 'clear-usage') {
        emit('clearUsage')
    }
}
</script>

<template>
  <section class="plugin-dev">
    <ModulePageHeader
        variant="compact"
        content-class="plugin-dev__hero"
        :title="t('plugin.advanced.title')"
        :eyebrow="t('plugin.advanced.eyebrow')"
        :subtitle="t('plugin.advanced.productSubtitle')"
    >
      <template #settings>
        <ModuleHeroSettingsMenu
            :ariaLabel="t('plugin.advanced.settingsMenu.aria')"
            :items="heroMenuItems"
            @select="onHeroMenuSelect"
        />
      </template>
    </ModulePageHeader>

    <MpJourneyStrip
        :actions="journeyActions"
        :entitlement-mode="entitlement.mode"
        :locked-count="entitlement.lockedCount"
        :on-browse-packs="() => pluginStore.openPackStore()"
    />

    <section class="mp-status" aria-label="developer tools metrics">
      <button
          v-for="tab in devTabs"
          :key="tab.id"
          type="button"
          class="mp-status__item"
          :class="[
            `mp-status__item--${tab.tone}`,
            { 'is-active': activeTab === tab.id },
          ]"
          @click="selectTab(tab.id)"
      >
        <span class="mp-status__label">{{ tab.label }}</span>
        <strong class="mp-status__value">{{ tab.count }}</strong>
      </button>
    </section>

    <nav class="plugin-dev__tabs" :aria-label="t('plugin.advanced.tabsLabel')">
      <button
          v-for="tab in devTabs"
          :key="`nav-${tab.id}`"
          type="button"
          class="plugin-dev-tab"
          :class="{ 'is-active': activeTab === tab.id }"
          @click="selectTab(tab.id)"
      >
        {{ tab.label }}
        <StatusPill
            v-if="tab.count > 0 || tab.id === 'matrix'"
            :variant="tab.id === 'audit' && tab.count > 0 ? 'warn' : 'neutral'"
            class="plugin-dev-tab__badge"
        >
          {{ tab.count }}
        </StatusPill>
      </button>
    </nav>

    <div class="plugin-dev__panel">
      <!-- Matrix -->
      <div v-show="activeTab === 'matrix'" class="plugin-dev-pane">
        <div class="plugin-dev-pane__head">
          <div>
            <h3 class="plugin-dev-pane__title">{{ t('plugin.matrix.title') }}</h3>
            <p class="plugin-dev-pane__desc">{{ t('plugin.matrix.description') }}</p>
          </div>
          <div class="plugin-dev-pane__actions">
            <div class="dw-segment">
              <button
                  type="button"
                  class="dw-segment__btn"
                  :class="{ 'is-active': matrixView === 'cards' }"
                  @click="matrixView = 'cards'"
              >
                {{ t('plugin.advanced.viewCards') }}
              </button>
              <button
                  type="button"
                  class="dw-segment__btn"
                  :class="{ 'is-active': matrixView === 'table' }"
                  @click="matrixView = 'table'"
              >
                {{ t('plugin.advanced.viewTable') }}
              </button>
            </div>
          </div>
        </div>

        <div class="plugin-dev-matrix-toolbar">
          <SearchInput
              v-model="matrixSearch"
              class="plugin-dev-matrix-toolbar__search"
              :placeholder="t('plugin.advanced.matrixSearch')"
          />
          <div class="plugin-dev-matrix-toolbar__filters dw-segment dw-segment--wrap">
            <button
                class="dw-segment__btn"
                :class="{ 'is-active': matrixCategory === 'all' }"
                type="button"
                @click="matrixCategory = 'all'"
            >
              {{ t('plugin.filterAll') }}
            </button>
            <button
                v-for="cat in CATEGORY_ORDER"
                :key="cat"
                class="dw-segment__btn"
                :class="{ 'is-active': matrixCategory === cat }"
                type="button"
                @click="matrixCategory = cat"
            >
              {{ t(`plugin.category.${cat}`) }}
            </button>
          </div>
        </div>

        <EmptyState
            v-if="!filteredMatrixRows.length"
            embedded
            :title="t('plugin.empty')"
            :hint="t('plugin.advanced.matrixSearch')"
        />

        <template v-else-if="matrixView === 'cards'">
          <div
              v-for="group in matrixGrouped"
              :key="group.category"
              class="plugin-dev-matrix-group"
          >
            <h4 class="plugin-dev-matrix-group__title">{{ t(`plugin.category.${group.category}`) }}</h4>
            <div class="plugin-dev-matrix-cards">
              <article
                  v-for="row in group.rows"
                  :key="row.id"
                  class="plugin-dev-matrix-card"
                  :class="{ 'is-enabled': row.enabled }"
              >
                <header class="plugin-dev-matrix-card__head">
                  <code class="plugin-dev-matrix-card__id">{{ row.id }}</code>
                  <StatusPill :variant="row.enabled ? 'success' : 'neutral'">
                    {{ row.enabled ? t('plugin.enabled') : t('plugin.disabled') }}
                  </StatusPill>
                </header>
                <div v-if="row.surfaces.length" class="plugin-dev-matrix-card__row">
                  <span class="plugin-dev-matrix-card__label">{{ t('plugin.surfacesTitle') }}</span>
                  <div class="plugin-dev-matrix-card__chips">
                    <span v-for="surface in row.surfaces" :key="surface" class="mp-chip">
                      {{ t(`plugin.surfaces.${surface}`) }}
                    </span>
                  </div>
                </div>
                <div v-if="row.requires.length" class="plugin-dev-matrix-card__row">
                  <span class="plugin-dev-matrix-card__label">{{ t('plugin.detail.requires') }}</span>
                  <div class="plugin-dev-matrix-card__chips">
                    <span v-for="reqId in row.requires" :key="reqId" class="mp-chip mp-chip--hint">
                      {{ requiredPluginLabel(reqId) }}
                    </span>
                  </div>
                </div>
                <div v-if="row.dbTypes.length" class="plugin-dev-matrix-card__row">
                  <span class="plugin-dev-matrix-card__label">{{ t('plugin.matrix.colDbTypes') }}</span>
                  <div class="plugin-dev-matrix-card__chips">
                    <span v-for="dbType in row.dbTypes" :key="dbType" class="mp-chip">{{ dbType }}</span>
                  </div>
                </div>
                <footer v-if="row.crossRef" class="plugin-dev-matrix-card__foot">
                  <button
                      type="button"
                      class="plugin-dev-link"
                      :title="row.crossRef"
                      @click="emit('copyCrossRefDoc', row.crossRef)"
                  >
                    {{ formatConnectorCapabilityCrossRefLabel(row.crossRef) }}
                  </button>
                </footer>
              </article>
            </div>
          </div>
        </template>

        <div v-else class="plugin-dev-table-wrap">
          <table class="plugin-dev-table">
            <thead>
              <tr>
                <th>{{ t('plugin.matrix.colId') }}</th>
                <th>{{ t('plugin.matrix.colCategory') }}</th>
                <th>{{ t('plugin.matrix.colEnabled') }}</th>
                <th>{{ t('plugin.matrix.colSurfaces') }}</th>
                <th>{{ t('plugin.matrix.colRequires') }}</th>
                <th>{{ t('plugin.matrix.colDbTypes') }}</th>
                <th>{{ t('plugin.matrix.colCrossRef') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredMatrixRows" :key="row.id">
                <td><code class="plugin-dev-table__id">{{ row.id }}</code></td>
                <td>{{ t(`plugin.category.${row.category}`) }}</td>
                <td>
                  <StatusPill :variant="row.enabled ? 'success' : 'neutral'">
                    {{ row.enabled ? t('plugin.enabled') : t('plugin.disabled') }}
                  </StatusPill>
                </td>
                <td>
                  <div class="plugin-dev-table__chips">
                    <span v-for="surface in row.surfaces" :key="surface" class="mp-chip">
                      {{ t(`plugin.surfaces.${surface}`) }}
                    </span>
                  </div>
                </td>
                <td>
                  <div class="plugin-dev-table__chips">
                    <span v-if="!row.requires.length" class="plugin-dev-muted">—</span>
                    <span v-for="reqId in row.requires" :key="reqId" class="mp-chip mp-chip--hint">
                      {{ requiredPluginLabel(reqId) }}
                    </span>
                  </div>
                </td>
                <td>
                  <div class="plugin-dev-table__chips">
                    <span v-if="!row.dbTypes.length" class="plugin-dev-muted">—</span>
                    <span v-for="dbType in row.dbTypes" :key="dbType" class="mp-chip">{{ dbType }}</span>
                  </div>
                </td>
                <td>
                  <span v-if="!row.crossRef" class="plugin-dev-muted">—</span>
                  <button
                      v-else
                      type="button"
                      class="plugin-dev-link"
                      :title="row.crossRef"
                      @click="emit('copyCrossRefDoc', row.crossRef)"
                  >
                    {{ formatConnectorCapabilityCrossRefLabel(row.crossRef) }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside class="plugin-dev-crossref">
          <h4 class="plugin-dev-crossref__title">{{ t('plugin.crossref.title') }}</h4>
          <p class="plugin-dev-crossref__hint">
            {{ t('plugin.crossref.hintBefore') }}
            <button
                type="button"
                class="plugin-dev-link"
                @click="emit('copyCrossRefDoc', CONNECTOR_CAPABILITY_DOC)"
            >
              {{ CONNECTOR_CAPABILITY_DOC }}
            </button>
            {{ t('plugin.crossref.hintAfter') }}
          </p>
          <div class="plugin-dev-crossref__grid">
            <div
                v-for="row in explorerCrossRefs"
                :key="row.pluginId"
                class="plugin-dev-crossref-card"
            >
              <code class="plugin-dev-crossref-card__id">{{ row.pluginId }}</code>
              <span class="plugin-dev-crossref-card__types">{{ row.dbTypes.join(', ') }}</span>
            </div>
          </div>
        </aside>
      </div>

      <!-- Usage -->
      <div v-show="activeTab === 'usage'" class="plugin-dev-pane">
        <div class="plugin-dev-pane__head">
          <div>
            <h3 class="plugin-dev-pane__title">{{ t('plugin.usage.title') }}</h3>
            <p class="plugin-dev-pane__desc">{{ t('plugin.usage.description') }}</p>
          </div>
        </div>
        <EmptyState
            v-if="!usageLeaderboard.length"
            embedded
            :title="t('plugin.usage.empty')"
            :hint="t('plugin.usage.emptyHint')"
        />
        <template v-else>
          <ol class="plugin-dev-usage-list">
            <li
                v-for="(row, index) in usageLeaderboard"
                :key="row.id"
                class="plugin-dev-usage-item"
            >
              <span class="plugin-dev-usage-item__rank">{{ index + 1 }}</span>
              <div class="plugin-dev-usage-item__body">
                <div class="plugin-dev-usage-item__head">
                  <span class="plugin-dev-usage-item__name">{{ requiredPluginLabel(row.id as PluginId) }}</span>
                  <StatusPill variant="neutral">
                    {{ t('plugin.usage.totalToggles', {count: row.total}) }}
                  </StatusPill>
                </div>
                <div class="plugin-dev-usage-item__bar-track">
                  <div
                      class="plugin-dev-usage-item__bar-fill"
                      :style="{ width: usageBarWidth(row.total) }"
                  />
                </div>
                <p class="plugin-dev-usage-item__meta">
                  {{ t('plugin.usage.enableDisable', {enable: row.entry.enable, disable: row.entry.disable}) }}
                </p>
              </div>
            </li>
          </ol>
        </template>
      </div>

      <!-- Connectors -->
      <div v-show="activeTab === 'connectors'" class="plugin-dev-pane">
        <div class="plugin-dev-pane__head">
          <div>
            <h3 class="plugin-dev-pane__title">{{ t('plugin.connectorJars.title') }}</h3>
            <p class="plugin-dev-pane__desc">{{ t('plugin.connectorJars.description') }}</p>
          </div>
        </div>
        <EmptyState
            v-if="catalogLoading"
            embedded
            :title="t('explorer.dbTypeLoading')"
        />
        <EmptyState
            v-else-if="catalogError"
            embedded
            :title="t('plugin.connectorJars.loadFailed')"
            :hint="catalogError"
        />
        <EmptyState
            v-else-if="!connectorJarCount"
            embedded
            :title="t('plugin.connectorJars.empty')"
            :hint="t('plugin.connectorJars.docsHint')"
        />
        <template v-else>
          <div class="plugin-dev-split">
            <div v-if="loadedPluginJars.length" class="plugin-dev-split__col">
              <h4 class="plugin-dev-split__title">{{ t('plugin.advanced.jarsLoaded') }}</h4>
              <ul class="plugin-dev-list">
                <li v-for="jar in loadedPluginJars" :key="jar" class="plugin-dev-list__item">
                  <code class="plugin-dev-list__code">{{ jar }}</code>
                  <StatusPill variant="success">{{ t('plugin.connectorJars.loaded') }}</StatusPill>
                </li>
              </ul>
            </div>
            <div v-if="pluginLoadFailures.length" class="plugin-dev-split__col plugin-dev-split__col--warn">
              <h4 class="plugin-dev-split__title">{{ t('plugin.advanced.jarsFailed') }}</h4>
              <ul class="plugin-dev-list">
                <li
                    v-for="failure in pluginLoadFailures"
                    :key="failure.jarName"
                    class="plugin-dev-list__item plugin-dev-list__item--failed"
                >
                  <div class="plugin-dev-list__main">
                    <code class="plugin-dev-list__code">{{ failure.jarName }}</code>
                    <p class="plugin-dev-list__reason">{{ failure.reason }}</p>
                  </div>
                  <StatusPill variant="error">{{ t('plugin.connectorJars.failed') }}</StatusPill>
                </li>
              </ul>
            </div>
          </div>
          <p class="plugin-dev-pane__hint">{{ t('plugin.connectorJars.docsHint') }}</p>
        </template>
      </div>

      <!-- Audit -->
      <div v-show="activeTab === 'audit'" class="plugin-dev-pane">
        <div
            v-if="referencePresetMismatchCount > 0"
            class="plugin-dev-preset-sync"
        >
          <div class="plugin-dev-preset-sync__copy">
            <h4 class="plugin-dev-preset-sync__title">{{ t('plugin.devTools.presetSyncTitle') }}</h4>
            <p class="plugin-dev-preset-sync__desc">
              {{ t('plugin.devTools.presetSyncDescription', {
                preset: referencePresetLabel,
                count: referencePresetMismatchCount,
              }) }}
            </p>
          </div>
          <div class="plugin-dev-preset-sync__actions">
            <button
                class="dw-text-btn dw-text-btn--accent"
                type="button"
                @click="emit('alignReferencePreset')"
            >
              {{ t('plugin.devTools.presetSyncAlign', { count: referencePresetMismatchCount }) }}
            </button>
            <button class="dw-text-btn" type="button" @click="emit('openPresetDiff')">
              {{ t('plugin.devTools.presetSyncViewDiff') }}
            </button>
          </div>
        </div>
        <div class="plugin-dev-pane__head">
          <div>
            <h3 class="plugin-dev-pane__title">{{ t('plugin.catalogAudit.title') }}</h3>
            <p class="plugin-dev-pane__desc">{{ t('plugin.catalogAudit.description') }}</p>
          </div>
        </div>
        <EmptyState
            v-if="!catalogAllIssueCount && !referencePresetMismatchCount"
            embedded
            :title="t('plugin.catalogAudit.empty')"
            :hint="t('plugin.catalogAudit.emptyHint')"
        />
        <div v-else class="plugin-dev-split">
          <div v-if="catalogAuditIssues.length" class="plugin-dev-split__col">
            <h4 class="plugin-dev-split__title">{{ t('plugin.advanced.auditConsistency') }}</h4>
            <ul class="plugin-dev-list">
              <li
                  v-for="issue in catalogAuditIssues"
                  :key="`c:${issue.kind}:${issue.id}:${issue.detail ?? ''}`"
                  class="plugin-dev-list__item"
              >
                <div class="plugin-dev-list__main">
                  <code class="plugin-dev-list__code">{{ issue.id }}</code>
                  <p v-if="issue.detail" class="plugin-dev-list__reason">{{ issue.detail }}</p>
                </div>
                <StatusPill variant="warn">{{ catalogAuditKindLabel(issue.kind) }}</StatusPill>
              </li>
            </ul>
          </div>
          <div v-if="catalogMetadataIssues.length" class="plugin-dev-split__col">
            <h4 class="plugin-dev-split__title">{{ t('plugin.advanced.auditMetadata') }}</h4>
            <ul class="plugin-dev-list">
              <li
                  v-for="issue in catalogMetadataIssues"
                  :key="`m:${issue.kind}:${issue.id}`"
                  class="plugin-dev-list__item"
              >
                <div class="plugin-dev-list__main">
                  <code class="plugin-dev-list__code">{{ issue.id }}</code>
                  <p class="plugin-dev-list__reason">{{ issue.detail }}</p>
                </div>
                <StatusPill variant="warn">{{ catalogMetadataKindLabel(issue.kind) }}</StatusPill>
              </li>
            </ul>
          </div>
        </div>
        <p class="plugin-dev-pane__hint">{{ t('plugin.catalogAudit.hint') }}</p>
      </div>

      <!-- Hooks -->
      <div v-show="activeTab === 'hooks'" class="plugin-dev-pane">
        <div class="plugin-dev-pane__head">
          <div>
            <h3 class="plugin-dev-pane__title">{{ t('plugin.hooks.title') }}</h3>
            <p class="plugin-dev-pane__desc">{{ t('plugin.hooks.description') }}</p>
          </div>
        </div>
        <EmptyState
            v-if="!hookRows.length"
            embedded
            :title="t('plugin.hooks.empty')"
            :hint="t('plugin.hooks.docsHint')"
        />
        <template v-else>
          <div class="plugin-dev-table-wrap">
            <table class="plugin-dev-table plugin-dev-table--hooks">
              <thead>
                <tr>
                  <th>{{ t('plugin.matrix.colId') }}</th>
                  <th>{{ t('plugin.advanced.hookType') }}</th>
                  <th>{{ t('plugin.advanced.hookSource') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in hookRows" :key="`${row.hook}:${row.pluginId}`">
                  <td><code class="plugin-dev-table__id">{{ row.pluginId }}</code></td>
                  <td><StatusPill variant="neutral">{{ hookLabel(row.hook) }}</StatusPill></td>
                  <td>
                    <StatusPill :variant="row.known ? 'success' : 'warn'">
                      {{ row.known ? t('plugin.advanced.hookKnown') : t('plugin.hooks.external') }}
                    </StatusPill>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="plugin-dev-pane__hint">{{ t('plugin.hooks.docsHint') }}</p>
          <div class="plugin-dev-pane__foot">
            <button
                v-for="tplId in hookTemplateIds"
                :key="tplId"
                class="dw-text-btn"
                type="button"
                @click="emit('copyHookTemplate', tplId)"
            >
              {{ hookTemplateLabel(tplId) }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
